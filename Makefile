PYTHON ?= python3
WORKERS ?= 4

.PHONY: all atlas clinvar analyze gpcr tracks site isoforms test

all: atlas clinvar analyze gpcr tracks site isoforms

atlas:
	$(PYTHON) atlas.py $(WORKERS)

clinvar:
	$(PYTHON) clinvar.py

analyze: atlas clinvar
	$(PYTHON) analyze.py

gpcr: atlas clinvar
	$(PYTHON) gpcr.py

tracks: atlas clinvar gpcr
	$(PYTHON) tracks.py

site: atlas clinvar analyze
	$(PYTHON) site.py

isoforms: atlas clinvar
	$(PYTHON) isoforms.py $(WORKERS)

test:
	$(PYTHON) -m unittest discover -s tests
