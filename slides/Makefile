deck := interface-explorer-summary
shots := $(addprefix shots/,home.png gene_GNAO1.png isoforms_APP.png gpcr.png variant3d.png)

$(deck).pdf: $(deck).tex $(shots)
	latexmk -lualatex -interaction=nonstopmode -halt-on-error -outdir=build $<
	cp build/$(deck).pdf $@

$(shots) &: shots.ts ../src/screenshots.ts
	cd .. && pnpm build
	node shots.ts

.PHONY: screenshots clean
screenshots:
	cd .. && pnpm build
	node shots.ts

clean:
	rm -rf build $(deck).pdf
