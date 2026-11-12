const app = document.getElementById('app')
const TRACKS = 'hg38-ncbiRefSeqCurated,interfaces,interface-variants,hg38-clinvarMain'
const CLINVAR = 'hg38-clinvarMain'
const VIEW_TRACKS = TRACKS.split(',').map(trackId => (trackId === CLINVAR ? { trackId, displaySnapshot: { type: 'LinearMultiRowFeatureDisplay' } } : trackId))
const LABELS = { pathogenic: 'Pathogenic', uncertain: 'Uncertain', benign: 'Benign' }
const cache = new Map()

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

async function load(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path).then(r => {
        if (!r.ok) {
          throw new Error(`${path}: HTTP ${r.status}`)
        }
        return r.json()
      }),
    )
  }
  return cache.get(path)
}

function genomeLink(chrom, start, end) {
  return `jbrowse/?assembly=hg38&loc=chr${chrom}:${start}-${end}&tracks=${TRACKS}`
}

function complexLink(gene, entity, loc, variant) {
  const view = {
    type: 'ProteinView',
    gene,
    alphaFoldComplexId: entity,
    ...(variant ? { variant } : {}),
    connectedView: { assembly: 'hg38', loc, tracks: VIEW_TRACKS },
  }
  return `jbrowse/?session=spec-${encodeURIComponent(JSON.stringify({ views: [view] }))}`
}

function variantLink(gene, v) {
  const partner = gene.partners.find(p => v.partners.includes(p.gene))
  return complexLink(gene.gene, partner.entity, `chr${v.chrom}:${v.pos - 30}-${v.pos + 30}`, `chr${v.chrom}:${v.pos}${v.allele ? ` ${v.allele}` : ''}`)
}

function chip(label) {
  return `<span class="chip ${label}">${LABELS[label]}</span>`
}

function percent(n, d) {
  return `${Math.round((100 * n) / d)}%`
}

function oddsText(e) {
  const [low, high] = e[INTERVAL]
  return `${e[ODDS].toFixed(1)}× <span class="muted">(95% CI ${low}–${high})</span>`
}

function tableShell(id, placeholder) {
  return `
    <div class="toolbar">
      <input type="search" id="${id}-filter" placeholder="${placeholder}" aria-label="${placeholder}" />
      <span class="muted" id="${id}-count"></span>
    </div>
    <div class="table-wrap"><table id="${id}"><thead></thead><tbody></tbody></table></div>`
}

function sortableTable({ id, rows, columns, sortKey, noun, matches }) {
  const table = document.getElementById(id)
  const filter = document.getElementById(`${id}-filter`)
  let key = sortKey
  let descending = true
  table.querySelector('thead').innerHTML = `<tr>${columns
    .map(c => `<th class="${c.num ? 'num' : ''}"><button data-key="${c.key}">${c.label}</button></th>`)
    .join('')}</tr>`
  const render = () => {
    const query = filter.value.trim().toUpperCase()
    const shown = rows
      .filter(row => !query || matches(row).some(text => text.toUpperCase().includes(query)))
      .sort((a, b) => {
        const order = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0
        return descending ? -order : order
      })
    table.querySelector('tbody').innerHTML = shown
      .map(row => `<tr>${columns.map(c => `<td class="${c.num ? 'num' : ''}">${c.cell(row)}</td>`).join('')}</tr>`)
      .join('')
    document.getElementById(`${id}-count`).textContent = `${shown.length} of ${rows.length} ${noun}`
  }
  filter.addEventListener('input', render)
  table.querySelectorAll('th button').forEach(button =>
    button.addEventListener('click', () => {
      descending = button.dataset.key === key ? !descending : columns.some(c => c.key === button.dataset.key && c.num)
      key = button.dataset.key
      render()
    }),
  )
  render()
}

const ODDS = 'Mantel–Haenszel odds ratio'
const INTERVAL = '95% CI (bootstrap over proteins)'
const FOREST = { min: 0.3, max: 5.5, ticks: [0.5, 1, 2, 4] }

function forestPosition(x) {
  return (100 * Math.log(x / FOREST.min)) / Math.log(FOREST.max / FOREST.min)
}

function interfaceShare(e, label) {
  const [n, d] = e[`${label} at interface`].split('/').map(Number)
  return { n, d, share: n / d }
}

function shareFigure(e) {
  const shares = ['pathogenic', 'benign'].map(label => ({ label, ...interfaceShare(e, label) }))
  const most = Math.max(...shares.map(s => s.share))
  return `
    <figure class="share-figure">
      <figcaption>Share of ClinVar missense variants that sit at a predicted interface</figcaption>
      ${shares
        .map(
          s => `<div class="share-row" title="${s.n.toLocaleString()} of ${s.d.toLocaleString()} ${s.label} variants">
            <div class="share-value">${Math.round(100 * s.share)}%</div>
            <div class="share-bar"><span style="width:${(100 * s.share) / most}%;background:var(--${s.label})"></span></div>
            <div class="muted">${LABELS[s.label]}: ${s.n.toLocaleString()} of ${s.d.toLocaleString()}</div>
          </div>`,
        )
        .join('')}
    </figure>`
}

function forestPlot(rows) {
  return `
    <div class="forest">
      ${rows
        .map(({ label, e }) => {
          const [low, high] = e[INTERVAL]
          return `<div class="forest-row" title="${e['proteins informative']} proteins with both pathogenic and benign variants">
            <div class="forest-label"><strong>${label}</strong><span class="muted">at an interface: ${['pathogenic', 'benign'].map(label => `${percent(interfaceShare(e, label).n, interfaceShare(e, label).d)} of ${interfaceShare(e, label).d.toLocaleString()} ${label}`).join(', ')}</span></div>
            <div class="forest-track">
              <span class="forest-null" style="left:${forestPosition(1)}%"></span>
              <span class="forest-ci" style="left:${forestPosition(low)}%;width:${forestPosition(high) - forestPosition(low)}%"></span>
              <span class="forest-dot" style="left:${forestPosition(e[ODDS])}%"></span>
            </div>
            <div class="forest-value">${e[ODDS].toFixed(1)}× <span class="muted">${low.toFixed(2)}–${high.toFixed(2)}</span></div>
          </div>`
        })
        .join('')}
      <div class="forest-row forest-axis">
        <div class="forest-label"></div>
        <div class="forest-track">${FOREST.ticks.map(t => `<span class="forest-tick" style="left:${forestPosition(t)}%">${t}×</span>`).join('')}</div>
        <div class="forest-value"></div>
      </div>
    </div>`
}

function compositionBar(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return `
    <div class="stack" role="img" aria-label="Classified missense variants at an interface: ${Object.keys(LABELS).map(label => `${counts[label].toLocaleString()} ${label}`).join(', ')}">
      ${Object.keys(LABELS).map(label => `<span style="flex-grow:${counts[label]};background:var(--${label})" title="${LABELS[label]}: ${counts[label].toLocaleString()} (${percent(counts[label], total)})"></span>`).join('')}
    </div>
    <div class="legend">
      ${Object.keys(LABELS).map(label => `<span><span class="swatch" style="background:var(--${label})"></span>${LABELS[label]} <strong>${counts[label].toLocaleString()}</strong> (${percent(counts[label], total)})</span>`).join('')}
    </div>`
}

function callBars(calls) {
  return `
    <div class="bars">
      ${Object.keys(LABELS)
        .map(label => {
          const { scored, likelyPathogenic } = calls[label]
          return `<div class="bar-row" title="${likelyPathogenic.toLocaleString()} of ${scored.toLocaleString()} scored">
            <div>ClinVar ${LABELS[label].toLowerCase()}</div>
            <div class="bar-track"><span style="width:${(100 * likelyPathogenic) / scored}%;background:var(--${label})"></span></div>
            <div class="bar-value">${percent(likelyPathogenic, scored)}</div>
          </div>`
        })
        .join('')}
    </div>`
}

const SCATTER_TICKS = [0, 5, 25, 50, 100, 200, 400]

function geneScatter(genes) {
  const width = 1000
  const height = 440
  const left = 54
  const bottom = 46
  const maxX = Math.max(...genes.map(g => g.uncertain))
  const maxY = Math.max(...genes.map(g => g.pathogenic))
  const x = v => left + Math.sqrt(v / maxX) * (width - left - 70)
  const y = v => height - bottom - Math.sqrt(v / maxY) * (height - bottom - 20)
  const distance = g => g.uncertain / maxX + g.pathogenic / maxY
  const placed = []
  genes
    .toSorted((a, b) => distance(b) - distance(a))
    .slice(0, 40)
    .forEach(g => {
      const box = { x: x(g.uncertain) + 8, y: y(g.pathogenic) - 7, w: g.gene.length * 8 + 4, h: 15, gene: g.gene }
      if (placed.every(p => box.x > p.x + p.w || p.x > box.x + box.w || box.y > p.y + p.h || p.y > box.y + box.h)) {
        placed.push(box)
      }
    })
  return `
    <div class="scatter-wrap">
      <svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="Each gene by its pathogenic and uncertain ClinVar missense variants at a predicted interface">
        ${SCATTER_TICKS.filter(t => t <= maxX).map(t => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="20" y2="${height - bottom}" /><text class="tick" x="${x(t)}" y="${height - bottom + 18}" text-anchor="middle">${t}</text>`).join('')}
        ${SCATTER_TICKS.filter(t => t <= maxY).map(t => `<line class="grid" x1="${left}" x2="${width - 16}" y1="${y(t)}" y2="${y(t)}" /><text class="tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
        <text class="axis-title" x="${(width + left) / 2}" y="${height - 6}" text-anchor="middle">Variants of uncertain significance at an interface →</text>
        <text class="axis-title" x="${left - 40}" y="12">↑ Pathogenic variants at an interface</text>
        ${genes.map((g, index) => `<circle data-index="${index}" cx="${x(g.uncertain)}" cy="${y(g.pathogenic)}" r="4.5" />`).join('')}
        ${placed.map(p => `<text class="gene-label" x="${p.x}" y="${p.y + 11}">${esc(p.gene)}</text>`).join('')}
      </svg>
    </div>
    <div class="tooltip" id="scatter-tip" hidden></div>`
}

function wireScatter(genes) {
  const tip = document.getElementById('scatter-tip')
  const svg = document.querySelector('.scatter')
  const geneAt = event => genes[event.target.dataset?.index]
  svg.addEventListener('pointermove', event => {
    const g = geneAt(event)
    tip.hidden = !g
    if (g) {
      tip.innerHTML = `<strong>${esc(g.gene)}</strong> with ${esc(g.topPartner)}${g.partners > 1 ? ` and ${g.partners - 1} more` : ''}<br />${Object.keys(LABELS).map(label => `<span class="swatch" style="background:var(--${label})"></span>${g[label]} ${label}`).join(' · ')}<br /><span class="muted">${g.interfaceResidues} interface residues of ${g.length}</span>`
      tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`
      tip.style.top = `${event.clientY + 14}px`
    }
  })
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true
  })
  svg.addEventListener('click', event => {
    const g = geneAt(event)
    if (g) {
      location.hash = `#/gene/${encodeURIComponent(g.page)}`
    }
  })
}

const EXAMPLE_GENES = ['VHL', 'GNAO1', 'MLH1', 'SDHB']

function geneSearch(genes) {
  return `
    <form class="search" id="gene-search">
      <input type="search" list="gene-names" placeholder="Jump to a gene, e.g. VHL" aria-label="Jump to a gene" autocomplete="off" />
      <datalist id="gene-names">${genes.map(g => `<option value="${esc(g.gene)}"></option>`).join('')}</datalist>
      <button class="button">Open</button>
      <span class="muted" id="gene-search-miss"></span>
    </form>
    <p class="examples muted">
      Try ${EXAMPLE_GENES.flatMap(name => genes.filter(g => g.page === name))
        .map(g => `<a href="#/gene/${encodeURIComponent(g.page)}">${esc(g.gene)}</a>`)
        .join(' · ')}
    </p>`
}

function wireGeneSearch(genes) {
  const form = document.getElementById('gene-search')
  const input = form.querySelector('input')
  const open = () => {
    const query = input.value.trim().toUpperCase()
    const g = genes.find(candidate => candidate.gene.toUpperCase() === query)
    document.getElementById('gene-search-miss').textContent = g || !query ? '' : `No gene called ${input.value.trim()} has a confident predicted partner.`
    if (g) {
      location.hash = `#/gene/${encodeURIComponent(g.page)}`
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault()
    open()
  })
  input.addEventListener('input', event => {
    if (event.inputType === 'insertReplacementText' || event.inputType === undefined) {
      open()
    }
  })
}

function geneLocus(gene) {
  const pad = Math.round((gene.end - gene.start) * 0.05) + 200
  return `chr${gene.chrom}:${gene.start - pad}-${gene.end + pad}`
}

function geneCase(gene, title, text) {
  const partner = gene.partners.toSorted((a, b) => b.variants - a.variants)[0]
  return `
    <section class="case">
      <h3>${title}</h3>
      <p>${text}</p>
      ${proteinMap(gene)}
      <div class="actions">
        <a class="button primary" href="${complexLink(gene.gene, partner.entity, geneLocus(gene))}">${esc(gene.gene)}–${esc(partner.gene)} in 3D beside the genome</a>
        <a class="button" href="#/gene/${encodeURIComponent(gene.page)}">All ${gene.variants.length} variants</a>
      </div>
    </section>`
}

function fill(id, render) {
  render()
    .catch(error => `<p class="muted">Could not load this section: ${esc(error.message)}.</p>`)
    .then(html => {
      const slot = document.getElementById(id)
      if (slot) {
        slot.innerHTML = html
      }
    })
}

async function homeCases(vhl) {
  const [gnao1, app695, isoforms] = await Promise.all([load('data/genes/GNAO1.json'), load('data/isoforms/APP.json'), load('data/isoformTotals.json')])
  const appPair = { ...app695, isoforms: app695.isoforms.filter(i => ['APP695', 'APP751'].includes(i.name)) }
  return `
    ${geneCase(vhl, 'VHL and elongin C', `${vhl.counts.pathogenic} pathogenic variants of the von Hippel–Lindau tumour suppressor sit on the ${vhl.interfaceResidues} residues that hold elongin C, with ${vhl.counts.uncertain} uncertain ones among them.`)}
    ${geneCase(gnao1, 'GNAO1, Gβ and the RGS proteins', `Gαo's ${gnao1.counts.pathogenic} pathogenic interface variants fall in two patches: the N-terminal helix that binds Gβ (L13P, I19M, L23F) and the switch regions that bind RGS proteins (T182I, Q205P, R206).`)}
    <section class="case">
      <h3>APP695, the neuronal isoform of APP</h3>
      <p>
        Splicing changes interfaces too. APP695 (P05067-4) has no Kunitz inhibitor domain, so it lacks most of APP's predicted interfaces with the
        proteases KLK11, KLK14 and prostasin; APP751 (P05067-8) keeps the domain and lacks none.
        Across ${isoforms.genes.toLocaleString()} disease genes and ${isoforms.alternativeIsoforms.toLocaleString()} modelled isoforms,
        ${isoforms.lackingInterface.toLocaleString()} isoforms lack half or more of a partner interface, and ${isoforms.genesLackingPathogenic.toLocaleString()} genes have an isoform missing a residue with a pathogenic variant.
      </p>
      ${isoformMap(appPair)}
      <div class="actions">
        <a class="button primary" href="#/isoforms/APP">All ${app695.isoforms.length} APP isoforms</a>
        <a class="button" href="#/isoforms">Isoforms of every gene</a>
      </div>
    </section>`
}

async function homeGpcr() {
  const gpcr = await load('data/gpcr.json')
  const gnas = gpcr.gAlphas.find(g => g.gene === 'GNAS')
  const compared = gpcr.gAlphas.filter(g => g.afdb && !g.chimeraOnly)
  return `
    <p class="lede">
      For G proteins we can check. ${gpcr.complexes.length} cryo-EM and X-ray complexes of amine receptors give the experimental
      receptor-facing surface of each Gα. AlphaFold DB's predicted GPCR complexes cover ${compared.map(g => `${Math.round(g.afdb.recall * 100)}% of it for ${esc(g.gene)}`).join(' and ')}.
      Gαs has no predicted GPCR complex at all, so its ${gnas.counts.length} receptor-facing residues, and the
      ${gnas.variants.filter(variant => variant.label === 'pathogenic').length} pathogenic variants on them, come from experiment alone.
    </p>
    <h3>${esc(gnas.gene)} <span class="muted">residues contacting a receptor, by number of the ${gnas.structures} structures</span></h3>
    ${surfaceMap(gnas)}`
}

function tile(value, label, href) {
  return `<a class="tile" href="${href}"><div class="value">${value.toLocaleString()}</div><div class="label">${label}</div></a>`
}

async function home() {
  const [summary, genes, vhl] = await Promise.all([load('data/summary.json'), load('data/genes.json'), load('data/genes/VHL.json')])
  const v = summary.variantsAtInterface
  const e = summary.enrichment
  const am = summary.alphaMissense.calls
  const shown = vhl.variants.find(variant => variant.label === 'pathogenic')
  const shownPartner = vhl.partners.find(p => shown.partners.includes(p.gene))
  app.innerHTML = `
    <section class="hero">
      <div class="hero-top">
      <div>
      <h1>Disease variants cluster where proteins touch</h1>
      <p class="lede">
        We mapped every confident <a href="https://alphafold.ebi.ac.uk/">AlphaFold DB</a> predicted
        complex of a human disease protein back to the genome, codon by codon, and asked which
        ClinVar missense variants land on an interface. Within the same protein, the odds of landing on one are
        <strong>${e.all[ODDS].toFixed(1)}×</strong> as high for a pathogenic variant as for a benign one.
      </p>
      <div class="actions">
        <a class="button primary" href="${variantLink(vhl, shown)}">See ${esc(vhl.gene)} ${esc(shown.change)} in 3D beside the genome</a>
        <a class="button" href="#/leads">${summary.leads.variants.toLocaleString()} strongest leads</a>
      </div>
      ${geneSearch(genes)}
      </div>
      ${shareFigure(e.all)}
      </div>
      <div class="tiles">
        ${tile(summary.proteins, 'human disease proteins checked', '#/about')}
        ${tile(summary.withPartner, `have a confident predicted partner (${percent(summary.withPartner, summary.proteins)}), ${summary.partners.toLocaleString()} interfaces in all`, '#/genes')}
        ${tile(v.uncertain, 'variants of uncertain significance sit on those interfaces', '#/genes')}
        ${tile(summary.leads.variants, 'of them change a residue where another substitution is pathogenic', '#/leads')}
      </div>
      <a class="hero-shot" href="${variantLink(vhl, shown)}">
        <img src="preview.jpg" width="1400" height="800" loading="lazy" alt="JBrowse with the VHL codon on the genome on the left, under interface and ClinVar tracks, and the same residue highlighted in the predicted VHL–${esc(shownPartner.gene)} complex on the right" />
        <span>Every variant opens like this: its codon on the genome beside its residue in the predicted complex. Here, a pathogenic ${esc(vhl.gene)} variant against ${esc(shownPartner.gene)}.</span>
      </a>
    </section>

    <section>
      <h2>It is not just folded versus disordered</h2>
      <p class="lede">
        Interfaces lie in folded regions, where pathogenic variants concentrate anyway. Restricting the comparison to folded
        residues, then to folded residues on the surface, leaves the effect standing: among exposed residues the odds ratio
        is ${e.orderedSurface[ODDS].toFixed(1)}×.
      </p>
      ${forestPlot([
        { label: 'All residues', e: e.all },
        { label: `Folded only (pLDDT ≥ ${summary.thresholds.plddt})`, e: e.ordered },
        { label: 'Folded and surface-exposed', e: e.orderedSurface },
      ])}
      <div class="split">
        <div>
          <h3>It holds at every confidence level</h3>
          <p class="muted">Interfaces grouped by the complex's ipSAE, each against residues at no interface.</p>
          ${forestPlot(
            Object.entries(e.byConfidenceBand)
              .filter(([name]) => name.startsWith('ipSAE'))
              .map(([label, band]) => ({ label: esc(label), e: band })),
          )}
        </div>
        <div>
          <h3>It adds modestly to AlphaMissense</h3>
          <p class="muted">The same comparison among variants AlphaMissense puts in one class. It sees one protein at a time, not the partner.</p>
          ${forestPlot(Object.entries(e.byAlphaMissenseClass).map(([label, group]) => ({ label: esc(label.replace('AlphaMissense l', 'L').replace('AlphaMissense a', 'A')), e: group })))}
        </div>
      </div>
      <p class="muted">Mantel–Haenszel odds ratios across proteins; lines are 95% intervals from resampling proteins, and the dashed line marks no difference. Hover a row for the number of proteins behind it.</p>
    </section>

    <section>
      <h2>${v.uncertain.toLocaleString()} variants of uncertain significance sit at an interface</h2>
      <p class="lede">
        Most variants at an interface have no verdict yet. Each one now has a structural hypothesis: the partner it may disturb.
      </p>
      ${compositionBar(v)}
      <h3>How many does AlphaMissense call likely pathogenic?</h3>
      ${callBars(am)}
      <p class="muted">
        Share of scored variants at an interface with AlphaMissense above ${summary.alphaMissense.likelyPathogenic}. The uncertain ones fall between
        the known pathogenic and benign: ${am.uncertain.likelyPathogenic.toLocaleString()} of them score likely pathogenic.
      </p>
      <h3>The strongest leads</h3>
      <p>
        ${summary.leads.variants.toLocaleString()} of the uncertain variants, in ${summary.leads.genes.toLocaleString()} genes, change an interface residue
        where a different substitution is already classified pathogenic.
      </p>
      <div class="actions">
        <a class="button primary" href="#/leads">The ${summary.leads.variants.toLocaleString()} strongest leads</a>
      </div>
    </section>

    <section>
      <h2>Every gene in the atlas</h2>
      <p class="lede">
        One dot per gene, ${genes.length.toLocaleString()} in all. Genes high up have known pathogenic variants at an interface;
        genes far right have many unresolved ones on the same surface. Click a dot to open the gene, or
        <a href="#/genes">browse the table</a>.
      </p>
      ${geneScatter(genes)}
    </section>

    <section>
      <h2>Three places to start</h2>
      <div id="home-cases"><p class="muted">Loading…</p></div>
    </section>

    <section>
      <h2>Do the predictions match experiment?</h2>
      <div id="home-gpcr"><p class="muted">Loading…</p></div>
      <div class="actions">
        <a class="button primary" href="#/gpcr">GPCRs and their G proteins</a>
        <a class="button" href="jbrowse/">Genome browser</a>
        <a class="button" href="#/about">Method and caveats</a>
      </div>
    </section>
    <p class="note">
      Only ${percent(summary.withPartner, summary.proteins)} of disease proteins have any predicted partner, and the complexes are predictions:
      an interface variant is a lead, not a mechanism.
    </p>`
  wireGeneSearch(genes)
  wireScatter(genes)
  fill('home-cases', () => homeCases(vhl))
  fill('home-gpcr', homeGpcr)
}

async function genesPage() {
  const [summary, genes] = await Promise.all([load('data/summary.json'), load('data/genes.json')])
  app.innerHTML = `
    <h1>Genes</h1>
    <p class="lede">
      The ${genes.length.toLocaleString()} disease genes with a confident predicted partner in
      <a href="https://alphafold.ebi.ac.uk/">AlphaFold DB</a>, and the ClinVar missense variants at their interfaces.
      Pick a gene to see its partners and variants, or open them on the genome.
    </p>
    <p class="note">
      Covers all ${summary.proteins.toLocaleString()} reviewed human proteins with a UniProt disease
      annotation. Only ${percent(summary.withPartner, summary.proteins)} have any predicted partner, and
      the complexes are predictions.${summary.unmapped ? ` ${summary.unmapped} more genes with a partner are left out because their coding coordinates don't map to hg38.` : ''}
      See <a href="#/about">About</a>.
    </p>
    ${tableShell('genes', 'Filter genes or partners')}`
  sortableTable({
    id: 'genes',
    rows: genes,
    sortKey: 'uncertain',
    noun: 'genes',
    matches: g => [g.gene, g.topPartner],
    columns: [
      { key: 'gene', label: 'Gene', cell: g => `<a href="#/gene/${encodeURIComponent(g.page)}">${esc(g.gene)}</a>` },
      { key: 'partners', label: 'Partners', num: true, cell: g => g.partners },
      { key: 'topPartner', label: 'Most confident partner', cell: g => esc(g.topPartner) },
      { key: 'bestIpsae', label: 'ipSAE', num: true, cell: g => g.bestIpsae.toFixed(2) },
      { key: 'interfaceResidues', label: 'Interface residues', num: true, cell: g => `${g.interfaceResidues} <span class="muted">/ ${g.length}</span>` },
      { key: 'pathogenic', label: 'Pathogenic', num: true, cell: g => g.pathogenic },
      { key: 'uncertain', label: 'Uncertain', num: true, cell: g => g.uncertain },
      { key: 'benign', label: 'Benign', num: true, cell: g => g.benign },
    ],
  })
}

async function leadsPage() {
  const [summary, leads] = await Promise.all([load('data/summary.json'), load('data/leads.json')])
  const am = summary.alphaMissense
  const amClass = score => (score > am.likelyPathogenic ? 'pathogenic' : score < am.likelyBenign ? 'benign' : 'uncertain')
  app.innerHTML = `
    <h1>Leads</h1>
    <p class="lede">
      ${leads.length.toLocaleString()} ClinVar variants of uncertain significance, in ${summary.leads.genes.toLocaleString()} genes, that change a residue at a
      confident predicted interface where a different substitution is already classified pathogenic.
    </p>
    <p class="note">
      A pathogenic substitution at the same residue is evidence clinical guidelines already count towards pathogenicity; the interface
      adds a hypothesis for why the residue matters. These are leads, not classifications: a milder substitution at the same residue can be harmless.
      AlphaMissense above ${am.likelyPathogenic} is likely pathogenic. See <a href="#/about">About</a>.
    </p>
    ${tableShell('leads', 'Filter genes, conditions or partners')}`
  sortableTable({
    id: 'leads',
    rows: leads.map(lead => ({ ...lead, score: lead.alphaMissense ?? -1, known: lead.sameResidue.length, touches: lead.partners.join(', '), condition: lead.knownConditions[0] ?? '' })),
    sortKey: 'score',
    noun: 'variants',
    matches: lead => [lead.gene, lead.change, ...lead.partners, ...lead.knownConditions],
    columns: [
      { key: 'gene', label: 'Gene', cell: lead => `<a href="#/gene/${encodeURIComponent(lead.page)}">${esc(lead.gene)}</a>` },
      { key: 'position', label: 'Change', cell: lead => `<a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${lead.variation}/" title="${esc(lead.review)}">${esc(lead.change)}</a>` },
      { key: 'condition', label: 'Condition of the pathogenic variant', cell: lead => conditionCell(lead.knownConditions) },
      { key: 'score', label: 'AlphaMissense', num: true, cell: lead => (lead.alphaMissense === undefined ? '<span class="muted">—</span>' : `<span class="count ${amClass(lead.alphaMissense)}">${lead.alphaMissense.toFixed(2)}</span>`) },
      { key: 'known', label: 'Pathogenic at this residue', cell: lead => lead.sameResidue.map(esc).join(', ') },
      { key: 'pathogenicResidues', label: 'Other pathogenic residues on the interface', num: true, cell: lead => lead.pathogenicResidues },
      { key: 'touches', label: 'Touches', cell: lead => `<span class="muted">${esc(lead.partners.slice(0, 2).join(', '))}${lead.partners.length > 2 ? ` +${lead.partners.length - 2}` : ''}</span>` },
      { key: 'pos', label: 'Open', cell: lead => `<span class="nowrap"><a href="${genomeLink(lead.chrom, lead.pos - 30, lead.pos + 30)}">Genome</a> · <a href="${complexLink(lead.gene, lead.entity, `chr${lead.chrom}:${lead.pos - 30}-${lead.pos + 30}`, `chr${lead.chrom}:${lead.pos}${lead.allele ? ` ${lead.allele}` : ''}`)}">3D</a></span>` },
    ],
  })
}

const MAP_PARTNERS = 12

function partnerResidues(partner) {
  return partner.runs.split(', ').flatMap(run => {
    const [a, b = a] = run.split('–').map(Number)
    return Array.from({ length: b - a + 1 }, (_, k) => a + k)
  })
}

function proteinMap(gene, variants = gene.variants) {
  const width = 1000
  const left = 90
  const scale = x => left + ((x - 1) / Math.max(gene.length - 1, 1)) * (width - left - 20)
  const rest = gene.partners.slice(MAP_PARTNERS)
  const tracks = [
    ...gene.partners.slice(0, MAP_PARTNERS).map(p => ({ label: p.gene, residues: partnerResidues(p) })),
    ...(rest.length ? [{ label: `+${rest.length} more`, residues: [...new Set(rest.flatMap(partnerResidues))] }] : []),
  ]
  const step = Math.pow(10, Math.floor(Math.log10(gene.length / 4)))
  const labels = []
  for (let x = step; x < gene.length * 0.94; x += step * (gene.length / step > 8 ? 2 : 1)) {
    labels.push(x)
  }
  const rows = { pathogenic: 0, uncertain: 14, benign: 28 }
  const top = 48
  const rowHeight = 13
  const axisY = top + tracks.length * rowHeight + 4
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} ${axisY + 22}" role="img" aria-label="Protein map of ${esc(gene.gene)}: variants and each partner's interface residues along ${gene.length} residues">
      ${Object.entries(rows)
        .map(
          ([label, y]) =>
            `<text class="row-label" x="0" y="${y + 9}">${LABELS[label]}</text>${variants
              .filter(v => v.label === label)
              .map(v => `<rect x="${scale(v.position) - 1.5}" y="${y}" width="3" height="10" fill="var(--${label})"><title>${esc(v.change)} ${LABELS[label]}</title></rect>`)
              .join('')}`,
        )
        .join('')}
      ${tracks
        .map((track, index) => {
          const y = top + index * rowHeight
          return `<text class="row-label" x="0" y="${y + 9}">${esc(track.label)}</text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${y + 5}" y2="${y + 5}" />
            ${track.residues.map(r => `<rect x="${scale(r) - 1}" y="${y}" width="2.5" height="10" fill="var(--interface)"><title>residue ${r}: interface with ${esc(track.label)}</title></rect>`).join('')}`
        })
        .join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${axisY}" y2="${axisY}" />
      ${[1, ...labels, gene.length].map(x => `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`).join('')}
    </svg></div>
    <div class="legend">
      <span><span class="swatch" style="background:var(--interface)"></span>interface residue, one row per partner</span>
      ${Object.keys(LABELS).map(label => `<span><span class="swatch" style="background:var(--${label})"></span>${LABELS[label].toLowerCase()} variant</span>`).join('')}
    </div>`
}

function conditionCell(conditions) {
  return conditions.length
    ? `<span title="${esc(conditions.join('; '))}">${esc(conditions[0])}${conditions.length > 1 ? ` <span class="muted">+${conditions.length - 1}</span>` : ''}</span>`
    : '<span class="muted">—</span>'
}

async function genePage(name) {
  const [gene, isoforms, summary] = await Promise.all([load(`data/genes/${encodeURIComponent(name)}.json`), load('data/isoforms.json'), load('data/summary.json')])
  const am = summary.alphaMissense
  const amClass = score => (score > am.likelyPathogenic ? 'pathogenic' : score < am.likelyBenign ? 'benign' : 'uncertain')
  const amTitle = { pathogenic: 'likely pathogenic', uncertain: 'ambiguous', benign: 'likely benign' }
  const isoformRow = isoforms.genes.find(r => r.accession === gene.accession)
  const pad = Math.round((gene.end - gene.start) * 0.05) + 200
  const conditions = [...Map.groupBy(gene.variants.flatMap(v => v.conditions), name => name)]
    .map(([name, uses]) => [name, uses.length])
    .sort((a, b) => b[1] - a[1])
  app.innerHTML = `
    <p><a href="#/genes">← All genes</a></p>
    <h1>${esc(gene.gene)}</h1>
    <p class="lede">
      UniProt <a href="https://www.uniprot.org/uniprotkb/${esc(gene.accession)}">${esc(gene.accession)}</a>,
      ${gene.length} residues, chr${esc(gene.chrom)}:${gene.start.toLocaleString()}–${gene.end.toLocaleString()} (${esc(gene.strand)}).
      ${gene.interfaceResidues} residues sit at a confident predicted interface;
      ${gene.variants.length} of its ${gene.classified} ClinVar-classified missense variants fall on them.
    </p>
    <div class="actions">
      <a class="button primary" href="${genomeLink(gene.chrom, gene.start - pad, gene.end + pad)}">View on the genome</a>
      <a class="button" href="https://genomes.jbrowse.org/protein-browser/?gene=${encodeURIComponent(gene.gene)}">Open in the protein browser</a>
      <a class="button" href="https://alphafold.ebi.ac.uk/entry/${esc(gene.accession)}">AlphaFold DB entry</a>
      ${isoformRow ? `<a class="button" href="#/isoforms/${encodeURIComponent(isoformRow.page)}">Isoforms (${isoformRow.modelled})</a>` : ''}
    </div>
    <h2>Protein map</h2>
    <div id="protein-map"></div>
    <h2>Predicted partners</h2>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Partner</th><th class="num">ipSAE</th><th class="num">ipTM</th>
        <th class="num">Residues</th><th>Interface residues</th><th class="num">Variants</th><th>Complex</th>
      </tr></thead>
      <tbody>${gene.partners
        .map(
          p => `<tr>
            <td><a href="https://www.uniprot.org/uniprotkb/${esc(p.accession)}">${esc(p.gene)}</a></td>
            <td class="num">${p.ipsae.toFixed(2)}</td>
            <td class="num">${p.iptm.toFixed(2)}</td>
            <td class="num">${p.residues}</td>
            <td class="muted">${esc(p.runs)}</td>
            <td class="num">${p.variants}</td>
            <td class="nowrap"><a href="${complexLink(gene.gene, p.entity, `chr${gene.chrom}:${gene.start - pad}-${gene.end + pad}`)}">3D + genome</a> · <a href="https://alphafold.ebi.ac.uk/entry/${esc(p.entity)}">AFDB</a></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <h2>ClinVar missense variants at an interface</h2>
    <div class="toolbar filters">
      ${Object.keys(LABELS)
        .map(label => `<label><input type="checkbox" value="${label}" checked /> ${chip(label)} ${gene.counts[label]}</label>`)
        .join('')}
      <label>Sort by <select id="variant-sort"><option value="position">position</option><option value="alphaMissense">AlphaMissense</option></select></label>
      <label>Condition <select id="variant-condition"><option value="">all</option>${conditions.map(([name, n]) => `<option value="${esc(name)}">${esc(name)} (${n})</option>`).join('')}</select></label>
    </div>
    <p class="muted">
      <a href="https://doi.org/10.1126/science.adg7492">AlphaMissense</a> predicts how likely a substitution is to be pathogenic, from 0 to 1:
      above ${am.likelyPathogenic} is likely pathogenic, below ${am.likelyBenign} likely benign. It is a prediction from sequence and the
      single-protein structure, and does not see the partner.
    </p>
    <div class="table-wrap"><table id="variants">
      <thead><tr><th>Change</th><th>ClinVar</th><th>Condition</th><th class="num">AlphaMissense</th><th>Touches</th><th>Genome</th><th>Structure</th></tr></thead>
      <tbody></tbody>
    </table></div>`
  const render = () => {
    const shown = new Set([...document.querySelectorAll('.filters input:checked')].map(i => i.value))
    const byScore = document.getElementById('variant-sort').value === 'alphaMissense'
    const condition = document.getElementById('variant-condition').value
    const variants = gene.variants.filter(v => shown.has(v.label) && (!condition || v.conditions.includes(condition)))
    document.getElementById('protein-map').innerHTML = proteinMap(gene, variants)
    document.querySelector('#variants tbody').innerHTML = variants
      .toSorted((a, b) => (byScore ? (b.alphaMissense ?? -1) - (a.alphaMissense ?? -1) : 0))
      .map(v => {
        const partner = gene.partners.find(p => v.partners.includes(p.gene))
        return `<tr>
          <td>${esc(v.change)}</td>
          <td class="nowrap">${chip(v.label)} <a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${v.variation}/" title="${esc(v.review)}">VCV${String(v.variation).padStart(9, '0')}</a></td>
          <td>${conditionCell(v.conditions)}</td>
          <td class="num">${v.alphaMissense === undefined ? '<span class="muted" title="AlphaMissense has no score for this substitution">—</span>' : `<span class="count ${amClass(v.alphaMissense)}" title="AlphaMissense: ${amTitle[amClass(v.alphaMissense)]}">${v.alphaMissense.toFixed(2)}</span>`}</td>
          <td>${v.partners.map(esc).join(', ')}</td>
          <td class="nowrap"><a href="${genomeLink(v.chrom, v.pos - 30, v.pos + 30)}">chr${esc(v.chrom)}:${v.pos.toLocaleString()}</a></td>
          <td class="nowrap"><a href="${variantLink(gene, v)}">with ${esc(partner.gene)}</a></td>
        </tr>`
      })
      .join('')
  }
  document.querySelectorAll('.filters input, .filters select').forEach(i => i.addEventListener('change', render))
  render()
}

const PLDDT_BANDS = [
  [90, 'var(--plddt-very-high)', 'very high (≥ 90)'],
  [70, 'var(--plddt-confident)', 'confident (70–90)'],
  [50, 'var(--plddt-low)', 'low (50–70)'],
  [0, 'var(--plddt-very-low)', 'very low (< 50)'],
]
const GENOME_TRACKS = ['hg38-ncbiRefSeqCurated', 'hg38-clinvarMain']

function plddtColor(score) {
  return PLDDT_BANDS.find(([min]) => score >= min)[1]
}

function residueBands(runs) {
  return runs.flatMap(([band, length]) => Array(length).fill(band))
}

function editText(edit) {
  const range = edit.start === edit.end ? `${edit.start}` : `${edit.start}–${edit.end}`
  const changed = [...edit.replacement].filter((letter, k) => edit.original?.[k] !== letter).length
  return !edit.replacement
    ? `${range} missing`
    : edit.original?.length === edit.replacement.length
      ? `${range} replaced, ${changed} of ${edit.replacement.length} residues differ`
      : `${range} replaced by ${edit.replacement.length} aa`
}

function structureLink(record, transcriptId, structures) {
  const view = {
    type: 'ProteinView',
    gene: record.gene,
    ...(transcriptId ? { transcriptId } : {}),
    structures,
    connectedView: { assembly: 'hg38', ...(record.locus ? { loc: record.locus } : {}), tracks: GENOME_TRACKS },
  }
  return `jbrowse/?session=spec-${encodeURIComponent(JSON.stringify({ views: [view] }))}`
}

function isoformMap(record) {
  const width = 1000
  const left = 110
  const rowHeight = 22
  const scale = x => left + ((x - 1) / Math.max(record.length - 1, 1)) * (width - left - 20)
  const step = (width - left - 20) / record.length
  const rows = [
    { label: 'Canonical', plddt: residueBands(record.canonical.plddt), segments: [[1, 1, record.length]], edits: [] },
    ...record.isoforms.map(i => ({ label: i.accession, plddt: residueBands(i.plddt), segments: i.segments, edits: i.edits })),
  ]
  const bars = (row, y) => {
    const runs = []
    row.segments.forEach(([isoStart, canonicalStart, length]) => {
      for (let k = 0; k < length; k++) {
        const color = plddtColor(row.plddt[isoStart - 1 + k])
        const last = runs[runs.length - 1]
        if (last && last.color === color && last.end === canonicalStart + k - 1) {
          last.end += 1
        } else {
          runs.push({ start: canonicalStart + k, end: canonicalStart + k, color })
        }
      }
    })
    return runs
      .map(r => `<rect x="${scale(r.start) - step / 2}" y="${y}" width="${(r.end - r.start + 1) * step}" height="12" fill="${r.color}" />`)
      .join('')
  }
  const replaced = (row, y) =>
    row.edits
      .filter(e => e.replacement)
      .map(
        e => `<rect class="replaced" x="${scale(e.start) - step / 2}" y="${y - 2}" width="${(e.end - e.start + 1) * step}" height="16"><title>${esc(editText(e))}: ${esc(e.replacement)}</title></rect>`,
      )
      .join('')
  const ticks = (positions, y, color, label) =>
    positions.map(x => `<rect x="${scale(x) - 1}" y="${y}" width="2.5" height="9" fill="${color}"><title>${label} ${x}</title></rect>`).join('')
  const marks = [
    { label: 'ClinVar pathogenic', positions: record.pathogenic ?? [], color: 'var(--pathogenic)', title: 'pathogenic missense at residue' },
    { label: 'Partner interface', positions: record.interface ?? [], color: 'var(--interface)', title: 'predicted interface residue' },
  ].filter(m => m.positions.length)
  const top = marks.length * 17 + 8
  const height = top + rows.length * rowHeight + 24
  const axisY = top + rows.length * rowHeight + 4
  const labelStep = Math.pow(10, Math.floor(Math.log10(record.length / 4)))
  const labels = []
  for (let x = labelStep; x < record.length * 0.94; x += labelStep * (record.length / labelStep > 8 ? 2 : 1)) {
    labels.push(x)
  }
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(record.gene)} isoforms aligned to the canonical protein, colored by AlphaFold pLDDT">
      ${marks.map((m, index) => `<text class="row-label" x="0" y="${index * 17 + 9}">${m.label}</text>${ticks(m.positions, index * 17, m.color, m.title)}`).join('')}
      ${rows
        .map((row, index) => {
          const y = top + index * rowHeight
          return `<text class="row-label" x="0" y="${y + 10}">${esc(row.label)}</text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(record.length)}" y1="${y + 6}" y2="${y + 6}" />
            ${bars(row, y)}${replaced(row, y)}`
        })
        .join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(record.length)}" y1="${axisY}" y2="${axisY}" />
      ${[1, ...labels, record.length].map(x => `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`).join('')}
    </svg></div>
    <div class="legend">
      ${PLDDT_BANDS.map(([, color, label]) => `<span><span class="swatch" style="background:${color}"></span>pLDDT ${label}</span>`).join('')}
      <span><span class="swatch replaced-swatch"></span>replaced in the isoform</span>
      <span>gap: missing from the isoform</span>
    </div>`
}

function interfaceLossCell(interfaceLost) {
  const entries = Object.entries(interfaceLost)
  const most = entries.filter(([, [lost, total]]) => lost >= total / 2).length
  return entries.length
    ? `<details><summary>${most ? `${most} lose half or more` : 'under half each'}</summary>${entries
        .map(([partner, [lost, total]]) => `${esc(partner)} <span class="muted">${lost} of ${total}</span>`)
        .join(', ')}</details>`
    : '—'
}

async function isoformIndex() {
  const { genes: rows, checked, described } = await load('data/isoforms.json')
  app.innerHTML = `
    <h1>Isoforms</h1>
    <p class="lede">
      AlphaFold DB now models UniProt's alternative isoforms. For each disease gene
      with modelled isoforms, see where each isoform differs from the canonical
      protein, whether the part they share keeps its predicted fold, and which
      pathogenic ClinVar sites and predicted partner interfaces it lacks.
    </p>
    <p class="note">
      AlphaFold DB models at least one alternative isoform for ${rows.length.toLocaleString()} of the
      ${checked.toLocaleString()} disease genes checked${checked < described ? `, of ${described.toLocaleString()} with described isoforms; the rest are still being fetched` : ' with described isoforms'}.
    </p>
    ${tableShell('isoforms', 'Filter genes')}`
  sortableTable({
    id: 'isoforms',
    rows,
    sortKey: 'pathogenicLost',
    noun: 'genes',
    matches: r => [r.gene, r.accession],
    columns: [
      { key: 'gene', label: 'Gene', cell: r => `<a href="#/isoforms/${encodeURIComponent(r.page)}">${esc(r.gene)}</a>` },
      { key: 'modelled', label: 'Isoforms modelled', num: true, cell: r => `${r.modelled} <span class="muted">of ${r.described}</span>` },
      { key: 'shortest', label: 'Shortest', num: true, cell: r => `${r.shortest} <span class="muted">/ ${r.length} aa</span>` },
      { key: 'foldedChanged', label: 'Folded residues missing or replaced', num: true, cell: r => r.foldedChanged },
      { key: 'unfolded', label: 'Shared residues losing confidence', num: true, cell: r => r.unfolded },
      { key: 'pathogenicLost', label: 'Pathogenic sites absent', num: true, cell: r => r.pathogenicLost },
      { key: 'interfaceLost', label: 'Isoforms lacking half or more of an interface', num: true, cell: r => r.interfaceLost },
    ],
  })
}

async function isoformPage(name) {
  const [record, genes] = await Promise.all([load(`data/isoforms/${encodeURIComponent(name)}.json`), load('data/genes.json')])
  const canonical = record.canonical
  const atlasGene = genes.find(g => g.accession === record.accession)
  app.innerHTML = `
    <p><a href="#/isoforms">← All isoforms</a></p>
    <h1>${esc(record.gene)} isoforms</h1>
    <p class="lede">
      UniProt <a href="https://www.uniprot.org/uniprotkb/${esc(record.accession)}/entry#sequences">${esc(record.accession)}</a>
      describes ${record.described} isoforms; AlphaFold DB models ${record.isoforms.length + 1} of them.
      The canonical isoform, ${esc(canonical.accession)}, is ${record.length} residues with mean pLDDT ${canonical.meanPlddt}.
    </p>
    <div class="actions">
      ${record.locus ? `<a class="button primary" href="jbrowse/?assembly=hg38&loc=${esc(record.locus)}&tracks=${GENOME_TRACKS.join(',')}">Transcripts on the genome</a>` : ''}
      <a class="button" href="${structureLink(record, canonical.refseq[0], [{ url: canonical.cif }])}">Canonical in 3D</a>
      ${atlasGene ? `<a class="button" href="#/gene/${encodeURIComponent(atlasGene.page)}">Interface atlas page</a>` : ''}
    </div>
    <h2>Isoforms on the canonical sequence</h2>
    <p class="muted">Each row places an isoform's residues at the canonical positions they share, colored by that isoform's own model.</p>
    ${isoformMap(record)}
    <h2>How each isoform differs</h2>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Isoform</th><th class="num">Length</th><th class="num">Mean pLDDT</th><th>Differs from canonical</th>
        <th class="num">Folded residues missing or replaced</th><th class="num">Shared residues losing confidence</th>
        <th>Pathogenic sites absent</th><th>Partner interface residues absent</th><th>RefSeq</th><th>Structure</th>
      </tr></thead>
      <tbody>${record.isoforms
        .map(
          i => `<tr>
            <td class="nowrap">${esc(i.accession)}${i.name && !i.accession.endsWith(`-${i.name}`) ? ` <span class="muted">${esc(i.name)}</span>` : ''}</td>
            <td class="num">${i.length}</td>
            <td class="num">${i.meanPlddt}</td>
            <td class="wide">${i.edits.map(e => esc(editText(e))).join('; ')}</td>
            <td class="num">${i.foldedChanged}</td>
            <td class="num">${i.unfolded}</td>
            <td>${i.pathogenicLost.length ? `<details><summary>${i.pathogenicLost.length}</summary>${i.pathogenicChanges.map(esc).join(', ')}</details>` : '0'}</td>
            <td>${interfaceLossCell(i.interfaceLost)}</td>
            <td class="nowrap">${i.refseq.length ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${esc(i.refseq[0])}">${esc(i.refseq[0])}</a>${i.refseq.length > 1 ? ` <span class="muted" title="${esc(i.refseq.slice(1).join(', '))}">+${i.refseq.length - 1}</span>` : ''}` : '—'}</td>
            <td class="nowrap"><a href="${structureLink(record, i.refseq[0], [{ url: i.cif }, { url: canonical.cif }])}">3D vs canonical</a> · <a href="https://alphafold.ebi.ac.uk/entry/${esc(i.model)}">AFDB</a></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <p class="note">
      "Losing confidence" counts shared residues whose pLDDT falls from ≥ 70 on the canonical model to &lt; 50 on the isoform's:
      a hint that the isoform does not keep that part folded, though pLDDT is a prediction's confidence, not a measurement.
      "3D vs canonical" opens the isoform's model superposed on the canonical one, linked to the isoform's own transcript.
    </p>`
}

const GPCR_TRACKS = ['hg38-ncbiRefSeqCurated', 'gpcr-interfaces', 'gpcr-interface-variants', 'hg38-clinvarMain']

function pdbStructureLink(gene, pdbId, locus) {
  const view = {
    type: 'ProteinView',
    gene,
    pdbId,
    connectedView: { assembly: 'hg38', ...(locus ? { loc: locus } : {}), tracks: GPCR_TRACKS },
  }
  return `jbrowse/?session=spec-${encodeURIComponent(JSON.stringify({ views: [view] }))}`
}

function variantCounts(variants) {
  return Object.keys(LABELS)
    .map(label => [label, variants.filter(v => v.label === label).length])
    .filter(([, n]) => n)
    .map(([label, n]) => `<span class="count ${label}">${n} ${LABELS[label].toLowerCase()}</span>`)
    .join(', ')
}

function variantDetails(variants, differing = [], generic = {}) {
  return variants.length
    ? `<details><summary>${variantCounts(variants)}</summary>${variants.map(v => `<a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${v.variation}/">${esc(v.change)}</a>${differing.includes(v.position) ? '<span title="The structure has a different residue here than the human protein">*</span>' : ''}${generic[v.position] ? ` <span class="generic" title="GPCRdb generic number">${esc(generic[v.position])}</span>` : ''} <span class="muted">${LABELS[v.label]}</span>`).join(', ')}</details>`
    : '—'
}

function residueCount(n) {
  return `${n} residue${n === 1 ? '' : 's'}`
}

function agreementText(afdb, partial) {
  return afdb
    ? `${Math.round(afdb.recall * 100)}% <span class="muted">of these${partial ? '' : `; ${Math.round(afdb.precision * 100)}% of the ${afdb.predicted} AFDB residues`} (vs ${esc(afdb.partner)})</span>`
    : '<span class="muted" title="AlphaFold DB has no complex of this receptor with a Gα">—</span>'
}

function sideCell(side) {
  const differing = side.differing.length
  const generic = side.generic ?? {}
  const count = residueCount(side.residues.length)
  return `${side.generic ? `<span class="tip" title="Residue (GPCRdb generic number): ${esc(side.residues.map(r => (generic[r] ? `${r} (${generic[r]})` : r)).join(', '))}">${count}</span>` : count}${differing ? ` <span class="muted" title="Residues ${side.differing.join(', ')} differ from the human protein in this structure">(${differing} not as in human)</span>` : ''}<br />${variantDetails(side.variants, side.differing, generic)}`
}

function gAlphaCell(gProteins) {
  return gProteins.length
    ? gProteins.map(g => `${gProteins.length > 1 || g.chimera ? `${esc(g.gene)}${g.chimera ? ' <span class="muted">segment</span>' : ''}: ` : ''}${sideCell(g)}`).join('<br />')
    : '<span class="muted" title="No part of this Gα matches a human Gα sequence">not mapped</span>'
}

function surfaceMap(g) {
  const length = g.length
  const width = 1000
  const scale = x => 20 + ((x - 1) / Math.max(length - 1, 1)) * (width - 40)
  const most = Math.max(...g.counts.map(([, n]) => n))
  const marks = g.variants.filter(v => v.label !== 'benign')
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} 76" role="img" aria-label="${esc(g.gene)} residues contacting a receptor, by number of structures">
      ${marks.map(v => `<rect x="${scale(v.position) - 1.5}" y="0" width="3" height="9" fill="var(--${v.label})"><title>${esc(v.change)} ${LABELS[v.label]}</title></rect>`).join('')}
      ${g.counts.map(([r, n]) => `<rect x="${scale(r) - 1.25}" y="${46 - (30 * n) / most}" width="2.5" height="${(30 * n) / most}" fill="var(--interface)"><title>residue ${r}: contacts the receptor in ${n} of ${g.structures} structures</title></rect>`).join('')}
      <line class="axis" x1="20" x2="${width - 20}" y1="48" y2="48" />
      ${[1, Math.round(length / 4), Math.round(length / 2), Math.round((3 * length) / 4), length].map(x => `<text class="tick" x="${scale(x)}" y="66" text-anchor="middle">${x}</text>`).join('')}
    </svg></div>`
}

async function gpcrPage() {
  const data = await load('data/gpcr.json')
  app.innerHTML = `
    <h1>GPCRs and their G proteins</h1>
    <p class="lede">
      Experimental receptor–G protein interfaces from ${data.complexes.length} cryo-EM and X-ray complexes of
      biogenic amine receptors (dopamine, serotonin, adrenergic and histamine), selected from
      <a href="https://gpcrdb.org/">GPCRdb</a> by BioHackathon Europe 2026 Project 9. Residues within 5 Å of
      the partner, between the receptor and Gα, are mapped to human codons, shown beside AlphaFold DB's predicted interfaces, and
      carried into JBrowse as the "experimental GPCR–G protein interface" tracks.
    </p>
    <h2>The receptor-facing surface of each Gα</h2>
    <p class="muted">Bars: how many structures put a receptor within 5 Å of the residue. Marks above: ClinVar pathogenic (red) and uncertain (orange) missense.</p>
    ${data.gAlphas
      .map(
        g => `
      <h3>${esc(g.gene)} <span class="muted">in ${g.structures} structure${g.structures > 1 ? 's' : ''}: ${g.receptors.map(esc).join(', ')}</span></h3>
      ${surfaceMap(g)}
      <p>
        ${residueCount(g.counts.length)} contact${g.counts.length === 1 ? 's' : ''} a receptor${g.chimeraOnly ? ', counting only the segments of engineered chimeras that carry this sequence' : ''}. ClinVar on them: ${variantDetails(g.variants)}<br />
        AlphaFold DB: ${g.afdb ? `its predicted GPCR complexes (${g.afdbReceptors.map(esc).join(', ')}) cover ${agreementText(g.afdb, g.chimeraOnly)}` : 'no predicted complex with a GPCR'}.
      </p>`,
      )
      .join('')}
    <h2>Complexes</h2>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Receptor</th><th>G protein</th><th>Structure</th><th>Receptor side</th><th>Gα side</th>
        <th>AlphaFold DB covers, receptor side</th><th>Open</th>
      </tr></thead>
      <tbody>${data.complexes
        .map(c => {
          const r = c.receptorSide
          return `<tr>
            <td class="nowrap">${esc(r.gene)}${c.species !== 'Human' ? ` <span class="muted">${esc(c.species)}</span>` : ''}</td>
            <td>${esc(c.g_subtype)} <span class="muted">${esc(c.g_note)}</span></td>
            <td class="nowrap"><a href="https://www.rcsb.org/structure/${esc(c.pdb)}">${esc(c.pdb)}</a> <span class="muted">${esc(c.method)}, ${esc(c.resolution)} Å</span></td>
            <td>${sideCell(r)}</td>
            <td>${gAlphaCell(c.gProteins)}</td>
            <td>${agreementText(r.afdb)}</td>
            <td class="nowrap">${r.locus ? `<a href="jbrowse/?assembly=hg38&loc=${esc(r.locus)}&tracks=${GPCR_TRACKS.join(',')}">Genome</a> · ` : ''}<a href="${pdbStructureLink(r.gene, c.pdb, r.locus)}">3D</a></td>
          </tr>`
        })
        .join('')}</tbody>
    </table></div>
    <h2>The other structures in the set</h2>
    <p class="muted">Receptors without a G protein bound, mostly inactive-state X-ray structures: the reference conformations.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Receptor</th><th>State</th><th>Structure</th><th>Open</th></tr></thead>
      <tbody>${data.others
        .map(
          o => `<tr>
            <td class="nowrap">${esc(o.gene)}${o.species !== 'Human' ? ` <span class="muted">${esc(o.species)}</span>` : ''}</td>
            <td>${esc(o.state)} <span class="muted">${esc(o.degree_active)}% active</span></td>
            <td class="nowrap"><a href="https://www.rcsb.org/structure/${esc(o.pdb)}">${esc(o.pdb)}</a> <span class="muted">${esc(o.method)}, ${esc(o.resolution)} Å</span></td>
            <td><a href="${pdbStructureLink(o.gene, o.pdb)}">3D</a></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <p class="note">
      The G proteins in these complexes are often engineered: dominant-negative Gαi1, mini-Gs and mini-Gq.
      SIFTS maps most of them to a single gene. ${data.complexes.filter(c => c.gProteins.some(g => g.chimera)).length} are chimeras it maps to none:
      each of their segments is assigned to the human Gα whose sequence it carries, so a mini-Gq contributes its Gαq α5 helix to GNAQ and its scaffold to GNAS.
      Non-human receptors and G proteins are aligned to the human protein before mapping to codons; a residue that differs from the human one is still mapped, and marked.
      Only receptor–Gα contacts are counted, not those with Gβγ. Receptor residues and variants carry
      <a href="https://docs.gpcrdb.org/generic_numbering.html">GPCRdb generic numbers</a> (e.g. 3.50x50), or their loop's name where GPCRdb gives none, so the same position can be compared across receptors. The Gα-side comparison sets these amine-receptor structures against AlphaFold DB's
      complexes with other GPCRs, so the share of predicted residues seen here is a lower bound.
    </p>`
}

async function about() {
  const [summary, gpcr] = await Promise.all([load('data/summary.json'), load('data/gpcr.json')])
  const chimeras = gpcr.complexes.filter(c => c.gProteins.some(g => g.chimera)).length
  const t = summary.thresholds
  app.innerHTML = `
    <h1>About</h1>
    <p class="lede">A prototype layer for genome browsers: predicted protein–protein interfaces and the ClinVar variants on them.</p>
    <h2>Method</h2>
    <ul>
      <li>All ${summary.proteins.toLocaleString()} reviewed human proteins with a UniProt disease annotation.</li>
      <li>Their heterodimers from AlphaFold DB's 2026 complex release (AlphaFold-Multimer), kept at ipSAE ≥ ${t.ipsae}, the AlphaFold DB team's threshold.</li>
      <li>Interface residues: any heavy atom within ${t.contact} Å of the partner, residue pLDDT ≥ ${t.plddt}. Mapped to hg38 codons with EBI Proteins API coordinates.</li>
      <li>Variants: single-nucleotide missense variants classified pathogenic, likely pathogenic, uncertain, likely benign or benign in NCBI's weekly ClinVar <code>variant_summary</code> (downloaded ${esc(summary.provenance.clinvarDownloaded)}), on a RefSeq transcript UniProt maps to the canonical isoform. Conflicting classifications are left out, and so is any variant whose wild-type residue does not match the canonical sequence at its position.</li>
      <li>Each variant's <a href="https://doi.org/10.1126/science.adg7492">AlphaMissense</a> pathogenicity, from the published table of every substitution in the canonical proteins. Of the ${summary.variantsAtInterface.uncertain.toLocaleString()} variants of uncertain significance at an interface, it scores ${summary.alphaMissense.calls.uncertain.scored.toLocaleString()} and calls ${summary.alphaMissense.calls.uncertain.likelyPathogenic.toLocaleString()} (${percent(summary.alphaMissense.calls.uncertain.likelyPathogenic, summary.alphaMissense.calls.uncertain.scored)}) likely pathogenic.</li>
    </ul>
    <h2>Does the interface mean anything?</h2>
    <p>Within each protein, pathogenic missense variants sit at a predicted interface more often than benign ones:</p>
    <ul>
      <li>All residues: ${oddsText(summary.enrichment.all)}</li>
      <li>Only folded residues (pLDDT ≥ 70): ${oddsText(summary.enrichment.ordered)}. The buried core is rich in pathogenic variants and is not an interface.</li>
      <li>Only folded, surface-exposed residues: ${oddsText(summary.enrichment.orderedSurface)}</li>
      ${Object.entries(summary.enrichment.byAlphaMissenseClass).map(([name, e]) => `<li>Only variants in the class "${esc(name)}": ${oddsText(e)}</li>`).join('')}
    </ul>
    <p>
      Mantel–Haenszel odds ratios across proteins, with intervals from resampling proteins. The surface line rules out "folded vs disordered" as the
      explanation, and the AlphaMissense lines show the interface adds a little to a predictor that never sees the partner. Each confidence band of
      ipSAE, compared with residues at no interface, gives about the same odds ratio.
    </p>
    <h2>Leads</h2>
    <p>
      The <a href="#/leads">${summary.leads.variants.toLocaleString()} leads</a> are the variants of uncertain significance at a confident interface residue where ClinVar
      classifies another missense variant pathogenic. Conditions are the names ClinVar's submitters gave, so one disease can appear under several names.
    </p>
    <h2>GPCRs</h2>
    <ul>
      <li>${gpcr.complexes.length} experimental receptor–G protein complexes of biogenic amine receptors, from a GPCRdb selection made by BioHackathon Europe 2026 Project 9, plus ${gpcr.others.length} receptor structures without a G protein.</li>
      <li>Contacts: heavy atoms within 5 Å between receptor and Gα. PDBe's SIFTS annotation gives each residue's UniProt position; a receptor chain SIFTS does not map is aligned to its UniProt sequence. Non-human proteins are aligned to the human ortholog.</li>
      <li>${chimeras} G proteins are engineered chimeras that SIFTS maps to no gene. Each stretch of such a chain is assigned to the human Gα it matches best, favouring the Gα the structure is annotated with.</li>
      <li>Every receptor and Gα here is looked up in AlphaFold DB, whether or not it is a disease protein.</li>
    </ul>
    <h2>Isoforms</h2>
    <ul>
      <li>AlphaFold DB's monomer models of UniProt's alternative isoforms, for disease genes with at least one modelled besides the canonical.</li>
      <li>Each isoform's sequence is rebuilt from UniProt's alternative-sequence edits and checked against its model's sequence, which gives every isoform residue its canonical position. A replacement of the same length is compared residue by residue, so only residues that change count as lost.</li>
      <li>RefSeq transcripts come from UniProt's cross-references, which name the isoform each one encodes.</li>
    </ul>
    <h2>Caveats</h2>
    <ul>
      <li>Coverage: ${percent(summary.withPartner, summary.proteins)} of disease proteins have any predicted partner. AlphaFold DB modelled STRING physical-interaction pairs only; TP53 has none and KRAS has no RAF.</li>
      <li>The complexes are predictions, and ipSAE ≥ ${t.ipsae} is "tentatively high-confidence".</li>
      <li>An interface variant is a lead, not a mechanism: the residue may matter for folding or for another partner.</li>
      <li>Experimental interfaces from the PDB are shown in the <a href="https://genomes.jbrowse.org/protein-browser/">protein browser</a>; this atlas adds predicted ones.</li>
    </ul>`
}

const NAV_PAGE = { gene: 'genes' }

function markNavigation(page) {
  document.querySelectorAll('.site-header nav a').forEach(link => {
    if (link.getAttribute('href') === `#/${NAV_PAGE[page] ?? page}`) {
      link.setAttribute('aria-current', 'page')
    } else {
      link.removeAttribute('aria-current')
    }
  })
}

async function route(event) {
  const [, page, arg] = (location.hash || '#/').split('/')
  markNavigation(page)
  try {
    if (page === 'gene' && arg) {
      await genePage(decodeURIComponent(arg))
    } else if (page === 'isoforms' && arg) {
      await isoformPage(decodeURIComponent(arg))
    } else if (page === 'isoforms') {
      await isoformIndex()
    } else if (page === 'gpcr') {
      await gpcrPage()
    } else if (page === 'genes') {
      await genesPage()
    } else if (page === 'leads') {
      await leadsPage()
    } else if (page === 'about') {
      await about()
    } else {
      await home()
    }
  } catch (error) {
    app.innerHTML = `<p>Could not load this page: ${esc(error.message)}. <a href="#/">Back to the start</a>.</p>`
  }
  window.scrollTo(0, 0)
  const heading = app.querySelector('h1')
  document.title = page && heading ? `${heading.textContent} · Interface atlas` : 'Interface atlas'
  if (event && heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}

window.addEventListener('hashchange', route)
route()
