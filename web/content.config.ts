import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { defineCollection } from 'astro:content'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './web/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string(),
    order: z.number().optional(),
  }),
})

export const collections = { blog }
