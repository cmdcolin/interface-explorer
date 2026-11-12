import { getCollection } from 'astro:content'

export async function posts() {
  return (await getCollection('blog')).toSorted(
    (a, b) =>
      b.data.date.localeCompare(a.data.date) ||
      (a.data.order ?? 0) - (b.data.order ?? 0),
  )
}
