"""Parse actual PDF objects and content operators, not metadata or byte matches.

Requires pypdf 6.10.0. This is a focused Figure-PDF regression contract,
not a PDF/UA validator or a replacement for screen-reader acceptance.
"""
import io
import json
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject, TextStringObject


def check(reader, expected):
    root = reader.trailer['/Root']
    assert root['/MarkInfo']['/Marked'].value is True, 'Document is not marked'
    assert root['/Lang'] == 'en', 'Missing/incorrect default language'
    assert root['/ViewerPreferences']['/DisplayDocTitle'].value is True
    assert reader.metadata.title, 'Missing document title'
    tree = root['/StructTreeRoot']
    assert tree['/Type'] == '/StructTreeRoot'
    assert len(tree['/K']) == 1
    document = tree['/K'][0].get_object()
    assert document['/S'] == '/Document'
    assert document['/P'] == tree, 'Broken document parent'
    figures = [ref.get_object() for ref in document['/K']]
    assert len(figures) == len(reader.pages) == len(expected), 'Wrong page/figure count'
    nums = tree['/ParentTree']['/Nums']
    assert list(nums[::2]) == list(range(len(expected))), 'Parent-tree page keys are wrong'
    assert tree['/ParentTreeNextKey'] == len(expected)
    for i, (page, figure, exp) in enumerate(zip(reader.pages, figures, expected)):
        assert page['/StructParents'] == i and page['/Tabs'] == '/S'
        assert figure['/Type'] == '/StructElem' and figure['/S'] == '/Figure'
        assert figure['/P'] == document and figure['/Pg'] == page, 'Broken figure parent/page'
        assert figure['/K'] == 0, 'Figure does not reference the marked content'
        parents = nums[2 * i + 1].get_object()
        assert len(parents) == 1 and parents[0].get_object() == figure, 'Broken reverse MCID lookup'
        alt = figure['/Alt']
        assert isinstance(alt, str) and len(alt.strip()) > 15, 'Missing figure alternative'
        if 'alt' in exp:
            assert alt == exp['alt'], f'Page {i + 1}: alternative changed: {alt!r}'
        for text in exp.get('includes', []):
            assert text in alt, f'Page {i + 1}: missing {text!r}'
        for text in exp.get('excludes', []):
            assert text not in alt, f'Page {i + 1}: leaked {text!r}'
        # Parse the DECOMPRESSED content stream. Every visible operation must
        # be inside the Figure sequence, with exactly one balanced MCID 0.
        stack, mcids, paints = [], [], []
        for args, op in page.get_contents().operations:
            if op == b'BDC':
                assert args[0] == '/Figure' and args[1]['/MCID'] == 0
                stack.append(0)
                mcids.append(0)
            elif op == b'BMC':
                stack.append(None)
            elif op == b'EMC':
                assert stack, 'Unbalanced marked content'
                stack.pop()
            elif op in (b'S', b's', b'f', b'F', b'f*', b'B', b'B*', b'b', b'b*',
                        b'Tj', b'TJ', b"'", b'"', b'Do', b'sh', b'INLINE IMAGE'):
                assert 0 in stack, f'Unmarked visible content: {op!r}'
                paints.append(op)
        assert mcids == [0] and not stack and paints, 'Missing/duplicate/unbalanced figure marking'
        if exp.get('vector'):
            assert any(op in paints for op in (b'S', b'f', b'f*', b'B')), 'Vector chart was flattened'
            assert page.extract_text().strip(), 'Vector text was lost'
        else:
            assert b'Do' in paints, 'Bitmap content was lost'


def guard_selftest(reader, expected):
    # Corrupt structurally different parts in memory, then serialize and
    # reparse. The oracle must reject each damaged exported document.
    def no_tree(w):
        del w.root_object[NameObject('/StructTreeRoot')]

    def wrong_alt(w):
        w.root_object['/StructTreeRoot']['/K'][0].get_object()['/K'][0].get_object()[NameObject('/Alt')] = TextStringObject('Wrong alternative')

    def wrong_page_key(w):
        w.pages[0][NameObject('/StructParents')] = NumberObject(99)

    def wrong_reverse(w):
        w.root_object['/StructTreeRoot']['/ParentTree']['/Nums'][1][0] = w.pages[0].indirect_reference

    def unmarked_paint(w):
        stream = w.pages[0].get_contents()
        stream.set_data(stream.get_data().replace(b'/Figure << /MCID 0 >> BDC', b'').replace(b'EMC', b''))
        w.pages[0].replace_contents(stream)

    for mutate in (no_tree, wrong_alt, wrong_page_key, wrong_reverse, unmarked_paint):
        writer = PdfWriter(clone_from=reader)
        mutate(writer)
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        try:
            check(PdfReader(buf, strict=True), expected)
        except (AssertionError, KeyError, TypeError):
            continue
        raise AssertionError('Guard accepted corruption: ' + mutate.__name__)
    print('  rejected 5 deliberately damaged PDF structures')


if __name__ == '__main__':
    manifest_path = Path(sys.argv[1])
    manifest = json.loads(manifest_path.read_text())
    for case in manifest:
        reader = PdfReader(manifest_path.parent / case['file'], strict=True)
        check(reader, case['pages'])
        print('  verified structure, alternatives and vector/bitmap content: ' + case['file'])
    if '--guard-selftest' in sys.argv:
        first = manifest[0]
        guard_selftest(PdfReader(manifest_path.parent / first['file'], strict=True), first['pages'])
