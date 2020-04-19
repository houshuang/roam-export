# roam-export

This is a script that parses the JSON export from Roam, and does various things with it. Very early stages, and ugly code, but already surprisingly useful.

To run, just make sure you're using Node 13.5 or higher. It has no dependencies.

If you run it without arguments, it will display this help text. 

```
usage: node index.mjs export.filename.json [--action] [pagename]

for example
--duplicates to display a list of page names we think are duplicates
--full to render a page with contents and linked references
--mentions to render only the linked references of a page
--text to render only the text of a page
--query to run a query, first list positive tags separated by comma, then optionally negative tags, so for example
  node index.mjs roam.json --query 'Peter Thiel,Roam' 'Note taking'
  would return all blocks that mention Peter and Roam, but not Note taking.
--tags shows you all the related tags (like the filter menu) sorted alphabetically, useful to run before running a query
```

# Duplicates
Currently uses a very simple algorithm (basically removing everything but a-z A-Z and then comparing, which catches both errors in capitalization, but also spaces, dashes etc.

