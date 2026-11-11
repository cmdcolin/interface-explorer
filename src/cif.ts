const TOKEN = /'((?:[^']|'(?=\S))*)'|"((?:[^"]|"(?=\S))*)"|(\S+)/g

function lineTokens(line: string) {
  return [...line.matchAll(TOKEN)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

function categoryLines(lines: string[], prefix: string) {
  const start = lines.findIndex(line => line.startsWith(prefix))
  const length =
    start < 0 ? 0 : lines.slice(start).findIndex(line => line.startsWith('#'))
  return start < 0
    ? []
    : lines.slice(start, length < 0 ? undefined : start + length)
}

export function cifCategory(content: string, category: string) {
  const prefix = `_${category}.`
  const tags: string[] = []
  const values: string[] = []
  let textField: string[] | undefined
  for (const line of categoryLines(content.split('\n'), prefix)) {
    if (textField) {
      if (line.startsWith(';')) {
        values.push(textField.join('\n'))
        textField = undefined
      } else {
        textField.push(line)
      }
    } else if (line.startsWith(';')) {
      textField = [line.slice(1)]
    } else {
      const [first, ...rest] = lineTokens(line)
      const tagged = line.startsWith(prefix) && first !== undefined
      if (tagged) {
        tags.push(first.slice(prefix.length))
      }
      values.push(...(tagged || first === undefined ? rest : [first, ...rest]))
    }
  }
  return Array.from(
    { length: tags.length ? Math.floor(values.length / tags.length) : 0 },
    (_, row) =>
      Object.fromEntries(
        tags.map((tag, column) => [
          tag,
          values[row * tags.length + column] ?? '',
        ]),
      ),
  )
}

export function atomSiteRows(content: string) {
  const tags: string[] = []
  const rows: Record<string, string>[] = []
  for (const line of content.split('\n')) {
    if (line.startsWith('_atom_site.')) {
      tags.push(line.slice('_atom_site.'.length).trim())
    } else if (
      tags.length &&
      (line.startsWith('ATOM') || line.startsWith('HETATM'))
    ) {
      const fields = line.split(/\s+/)
      rows.push(
        Object.fromEntries(
          tags.map((tag, column) => [tag, fields[column] ?? '']),
        ),
      )
    }
  }
  return rows
}
