# Assignment: inspect data and explain a group comparison

Use `classroom.csv`, supplied beside this document. The eight records are
fictional practice data. The goal is to compare two groups and submit a
reproducible explanation with exact values. Work in your assigned edition
(browser or jamovi), using your ordinary assistive technology and product help.
Tell the evaluator whenever an action or result is difficult to discover or use.

## C01 — Start and find instructions

Open the assigned product and identify its version and edition. Find the
instructions for importing data and choosing a chart. Open Help and return
to your work. In jamovi, locate the Pandion analyses from the installed module.
Tell the evaluator if the required module or data cannot be reached.

## C02 — Import and inspect

Open the supplied CSV using the ordinary file picker. In the browser, inspect
the import preview and confirm the import. In either edition, identify the
number of records, the column names and the two group names. Treat Group as
categorical and Score as numeric/continuous. Find the record with a missing
Score and distinguish it from a zero. No rows or values should be excluded.

## C03 — Correct a value and recover

The missing Score for participant P08 should be 20. Enter that value, then
undo the correction, confirm the missing value returns, and enter 20 again.
Move away and back to verify that the correction persisted. Tell the evaluator
how the application communicated the active row, column, value and edit result.
Do not overwrite the supplied original CSV.

## C04 — Create a computed column

Discover the command for a computed column and name the column `ScorePlus5`.
Enter the deliberately incomplete formula `Score +` and attempt to apply it.
Read the error and correct the formula to `Score + 5`. Confirm the new column
has a value for every record. Use the edition's own computed-column facility;
jamovi's Data editor is part of the jamovi acceptance test.

Change P01's Score from 10 to 11 and check that its computed value changes.
Undo that last edit and check that both values return. Leave P01 at 10 and
P08 at 20. Save your editable project using the edition's native format.

## C05 — Choose and configure the chart

Select Pandion's Compare Groups analysis. First try assigning Score alone;
read the guidance about required variables. Then assign Group to the category
(x) role and Score to the outcome (y) role. Make a chart of group means with
error bars showing one standard error (SE). Use the normal controls to reach
this configuration and confirm what the error bars represent.

Find the chart-title setting, set the title to “Practice scores by group,”
then return to the chart. Try “Find a setting” if available. Cancel one
settings dialog or menu and confirm you can continue from a useful position.
In jamovi, leave and re-enter the results frame using your normal navigation.

## C06 — Read and explain results

Use the chart's description and Statistics results to answer:

1. What does this chart compare, and what are the x and y variables?
2. What is each group's valid sample size and mean Score?
3. What is each group's sample standard deviation and standard error?
4. Which mean is larger, and by how much?
5. What do the error bars show? Are they confidence intervals?

Record the precision the results display (for example SD 2.58 and SE 1.29
when the table shows two decimals); do not invent extra digits. Explain the result in
ordinary language; no significance test or causal claim is required. Ask the
evaluator if a required value cannot be obtained from the available results.

## C07 — Describe and export

Give the figure a caption and meaningful description explaining the groups,
means and error bars. Export a PDF through the available edition's normal
workflow. Also prepare an accessible text/table answer containing the exact
values from C06. Do not assume a picture of a table supplies readable values.

Close the PDF and reopen it in the assigned PDF reader. Read the figure
description and caption and identify their sequence. Check that the companion
answer conveys the same result. Record which export path was used in jamovi:
Pandion's figure export and jamovi's full-results export are different outputs.

## C08 — Save, reopen and submit

Save your project (`.pand` in the standalone app, `.omv` in jamovi), close it
and reopen it from disk. Confirm the corrected value, computed column, role
assignments, chart title and required results survived. Export the final data
as CSV if required by the course.

Upload the assigned files through the real course submission system when the
evaluator provides a test submission area. Reopen the uploaded files and
verify the text/table and figure description are still available. A local file
test does not complete this submission task.

## C09 — Course-specific extensions

The instructor supplies these before acceptance if the course requires them:
additional chart families, exclusions or filters, large/virtualized datasets,
multi-panel Layouts, Notebook authoring, or other required export formats.
For Layouts/Notebook, create, select, edit, reorder, save/reopen and export the
assigned composition using the same access method. Record results separately;
these features are not accepted by completing a single Compare Groups chart.
