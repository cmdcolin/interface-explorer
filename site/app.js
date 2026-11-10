const app = document.getElementById('app')
const TRACKS = 'hg38-ncbiRefSeqCurated,interfaces,interface-variants,hg38-clinvarMain'
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

function chip(label) {
  return `<span class="chip ${label}">${LABELS[label]}</span>`
}

function percent(n, d) {
  return `${Math.round((100 * n) / d)}%`
}

function oddsText(e) {
  const [low, high] = e['95% CI (bootstrap over proteins)']
  return `${e['Mantel–Haenszel odds ratio'].toFixed(1)}× <span class="muted">(95% CI ${low}–${high})</span>`
}

async function home() {
  const [summary, genes] = await Promise.all([load('data/summary.json'), load('data/genes.json')])
  const v = summary.variantsAtInterface
  app.innerHTML = `
    <h1>Which disease variants sit where proteins touch?</h1>
    <p class="lede">
      For each human disease gene, this atlas marks the codons whose residues sit
      at an interface in an <a href="https://alphafold.ebi.ac.uk/">AlphaFold DB</a>
      predicted complex, and lists the ClinVar missense variants that fall there.
      Pick a gene to see its partners and variants, or open them on the genome.
    </p>
    <div class="tiles">
      <div class="tile"><div class="value">${summary.genes}</div><div class="label">genes with a confident predicted partner, of ${summary.sampled} sampled</div></div>
      <div class="tile"><div class="value">${summary.partners}</div><div class="label">predicted partner interfaces (ipSAE ≥ ${summary.thresholds.ipsae})</div></div>
      <div class="tile"><div class="value">${v.uncertain}</div><div class="label">variants of uncertain significance at an interface</div></div>
      <div class="tile"><div class="value">${summary.enrichment.orderedSurface['Mantel–Haenszel odds ratio'].toFixed(1)}×</div><div class="label">pathogenic vs benign at interfaces, among folded surface residues</div></div>
    </div>
    <p class="note">
      A prototype on ${summary.sampled} random human disease proteins. Only
      ${percent(summary.withPartner, summary.sampled)} have any predicted partner, and
      the complexes are predictions. See <a href="#/about">About</a>.
    </p>
    <h2>Genes</h2>
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter genes or partners" aria-label="Filter genes" />
      <span class="muted" id="count"></span>
    </div>
    <div class="table-wrap"><table id="genes">
      <thead><tr>
        <th><button data-key="gene">Gene</button></th>
        <th class="num"><button data-key="partners">Partners</button></th>
        <th><button data-key="topPartner">Most confident partner</button></th>
        <th class="num"><button data-key="bestIpsae">ipSAE</button></th>
        <th class="num"><button data-key="interfaceResidues">Interface residues</button></th>
        <th class="num"><button data-key="pathogenic">Pathogenic</button></th>
        <th class="num"><button data-key="uncertain">Uncertain</button></th>
        <th class="num"><button data-key="benign">Benign</button></th>
      </tr></thead>
      <tbody></tbody>
    </table></div>`
  let sortKey = 'uncertain'
  let descending = true
  const render = () => {
    const query = document.getElementById('filter').value.trim().toUpperCase()
    const rows = genes
      .filter(g => !query || g.gene.toUpperCase().includes(query) || g.topPartner.toUpperCase().includes(query))
      .sort((a, b) => {
        const order = a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0
        return descending ? -order : order
      })
    document.querySelector('#genes tbody').innerHTML = rows
      .map(
        g => `<tr>
          <td><a href="#/gene/${encodeURIComponent(g.gene)}">${esc(g.gene)}</a></td>
          <td class="num">${g.partners}</td>
          <td>${esc(g.topPartner)}</td>
          <td class="num">${g.bestIpsae.toFixed(2)}</td>
          <td class="num">${g.interfaceResidues} <span class="muted">/ ${g.length}</span></td>
          <td class="num">${g.pathogenic}</td>
          <td class="num">${g.uncertain}</td>
          <td class="num">${g.benign}</td>
        </tr>`,
      )
      .join('')
    document.getElementById('count').textContent = `${rows.length} of ${genes.length} genes`
  }
  document.getElementById('filter').addEventListener('input', render)
  document.querySelectorAll('#genes th button').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.key
      descending = key === sortKey ? !descending : key !== 'gene' && key !== 'topPartner'
      sortKey = key
      render()
    })
  })
  render()
}

function proteinMap(gene) {
  const width = 1000
  const scale = x => 20 + ((x - 1) / Math.max(gene.length - 1, 1)) * (width - 40)
  const interfaceTicks = new Set()
  gene.partners.forEach(p =>
    p.runs.split(', ').forEach(run => {
      const [a, b = a] = run.split('–').map(Number)
      for (let r = a; r <= b; r++) {
        interfaceTicks.add(r)
      }
    }),
  )
  const step = Math.pow(10, Math.floor(Math.log10(gene.length / 4)))
  const labels = []
  for (let x = step; x < gene.length * 0.94; x += step * (gene.length / step > 8 ? 2 : 1)) {
    labels.push(x)
  }
  const rows = { pathogenic: 8, uncertain: 22, benign: 36 }
  return `
    <svg class="map" viewBox="0 0 ${width} 110" role="img" aria-label="Protein map of ${esc(gene.gene)}: interface residues and variants along ${gene.length} residues">
      ${Object.entries(rows)
        .map(([label, y]) =>
          gene.variants
            .filter(v => v.label === label)
            .map(v => `<rect x="${scale(v.position) - 1.5}" y="${y}" width="3" height="10" fill="var(--${label})"><title>${esc(v.change)} ${LABELS[label]}</title></rect>`)
            .join(''),
        )
        .join('')}
      ${[...interfaceTicks].map(r => `<rect x="${scale(r) - 1}" y="56" width="2.5" height="16" fill="var(--interface)"><title>residue ${r}: interface</title></rect>`).join('')}
      <line class="axis" x1="20" x2="${width - 20}" y1="80" y2="80" />
      ${[1, ...labels, gene.length].map(x => `<text class="tick" x="${scale(x)}" y="98" text-anchor="middle">${x}</text>`).join('')}
    </svg>
    <div class="legend">
      <span><span class="swatch" style="background:var(--interface)"></span>interface residue</span>
      <span><span class="swatch" style="background:var(--pathogenic)"></span>pathogenic (top row)</span>
      <span><span class="swatch" style="background:var(--uncertain)"></span>uncertain (middle)</span>
      <span><span class="swatch" style="background:var(--benign)"></span>benign (bottom)</span>
    </div>`
}

async function genePage(name) {
  const gene = await load(`data/genes/${encodeURIComponent(name)}.json`)
  const pad = Math.round((gene.end - gene.start) * 0.05) + 200
  app.innerHTML = `
    <p><a href="#/">← All genes</a></p>
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
    </div>
    <h2>Protein map</h2>
    ${proteinMap(gene)}
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
            <td><a href="https://alphafold.ebi.ac.uk/entry/${esc(p.entity)}">3D</a></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <h2>ClinVar missense variants at an interface</h2>
    <div class="toolbar filters">
      ${Object.keys(LABELS)
        .map(label => `<label><input type="checkbox" value="${label}" checked /> ${chip(label)} ${gene.counts[label]}</label>`)
        .join('')}
    </div>
    <div class="table-wrap"><table id="variants">
      <thead><tr><th>Change</th><th>ClinVar</th><th>Touches</th><th>Genome</th></tr></thead>
      <tbody></tbody>
    </table></div>`
  const render = () => {
    const shown = new Set([...document.querySelectorAll('.filters input:checked')].map(i => i.value))
    document.querySelector('#variants tbody').innerHTML = gene.variants
      .filter(v => shown.has(v.label))
      .map(
        v => `<tr>
          <td>${esc(v.change)}</td>
          <td>${chip(v.label)} ${v.clinvar ? `<a href="https://www.ncbi.nlm.nih.gov/clinvar/${esc(v.clinvar)}">${esc(v.clinvar)}</a>` : ''}</td>
          <td>${v.partners.map(esc).join(', ')}</td>
          <td><a href="${genomeLink(v.chrom, v.pos - 30, v.pos + 30)}">chr${esc(v.chrom)}:${v.pos.toLocaleString()}</a></td>
        </tr>`,
      )
      .join('')
  }
  document.querySelectorAll('.filters input').forEach(i => i.addEventListener('change', render))
  render()
}

async function about() {
  const summary = await load('data/summary.json')
  const t = summary.thresholds
  app.innerHTML = `
    <h1>About</h1>
    <p class="lede">A prototype layer for genome browsers: predicted protein–protein interfaces and the ClinVar variants on them.</p>
    <h2>Method</h2>
    <ul>
      <li>${summary.sampled} reviewed human proteins with a UniProt disease annotation, sampled at random.</li>
      <li>Their heterodimers from AlphaFold DB's 2026 complex release (AlphaFold-Multimer), kept at ipSAE ≥ ${t.ipsae}, the AlphaFold DB team's threshold.</li>
      <li>Interface residues: any heavy atom within ${t.contact} Å of the partner, residue pLDDT ≥ ${t.plddt}. Mapped to hg38 codons with EBI Proteins API coordinates.</li>
      <li>Variants: missense variants with a ClinVar classification, from the EBI Proteins API.</li>
    </ul>
    <h2>Does the interface mean anything?</h2>
    <p>Within each protein, pathogenic missense variants sit at a predicted interface more often than benign ones:</p>
    <ul>
      <li>All residues: ${oddsText(summary.enrichment.all)}</li>
      <li>Only folded (pLDDT ≥ 70), surface-exposed residues: ${oddsText(summary.enrichment.orderedSurface)}</li>
    </ul>
    <p>Mantel–Haenszel odds ratios across proteins, with intervals from resampling proteins. The second line rules out "folded vs disordered" as the explanation.</p>
    <h2>Caveats</h2>
    <ul>
      <li>Coverage: ${percent(summary.withPartner, summary.sampled)} of sampled proteins have any predicted partner. AlphaFold DB modelled STRING physical-interaction pairs only; TP53 has none and KRAS has no RAF.</li>
      <li>The complexes are predictions, and ipSAE ≥ ${t.ipsae} is "tentatively high-confidence".</li>
      <li>An interface variant is a lead, not a mechanism: the residue may matter for folding or for another partner.</li>
      <li>Experimental interfaces from the PDB are shown in the <a href="https://genomes.jbrowse.org/protein-browser/">protein browser</a>; this atlas adds predicted ones.</li>
    </ul>`
}

async function route() {
  const [, page, arg] = (location.hash || '#/').split('/')
  try {
    if (page === 'gene' && arg) {
      await genePage(decodeURIComponent(arg))
    } else if (page === 'about') {
      await about()
    } else {
      await home()
    }
  } catch (error) {
    app.innerHTML = `<p>Could not load this page: ${esc(error.message)}. <a href="#/">Back to all genes</a>.</p>`
  }
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', route)
route()
