suppressPackageStartupMessages({
  library(ggplot2)
  library(jsonlite)
  library(patchwork)
})

root <- normalizePath(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), ".."))
summary <- fromJSON(file.path(root, "site", "data", "summary.json"), simplifyVector = FALSE)
out <- file.path(root, "site", "figures")
dir.create(out, showWarnings = FALSE)

interface_colour <- "#2a78d6"
pathogenic_colour <- "#c42c2c"
benign_colour <- "#7a7975"

theme_set(
  theme_minimal(base_size = 13) +
    theme(
      plot.background = element_rect(fill = "white", colour = NA),
      panel.grid.minor = element_blank(),
      panel.grid.major.y = element_blank(),
      strip.text = element_text(face = "bold", hjust = 0),
      legend.position = "top",
      legend.justification = "left",
      legend.title = element_blank()
    )
)

save <- function(plot, name, height) {
  ggsave(file.path(out, paste0(name, ".svg")), plot, width = 8, height = height, device = svg)
}

odds_row <- function(group, label, e) {
  data.frame(
    group = group,
    label = label,
    odds = e[["Mantel–Haenszel odds ratio"]],
    low = e[["95% CI (bootstrap over proteins)"]][[1]],
    high = e[["95% CI (bootstrap over proteins)"]][[2]]
  )
}

e <- summary$enrichment
surface <- "ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)"
residues <- "Residues compared"
matched <- "Folded surface, matched for conservation"
confidence <- "Complexes by ipSAE"
kind <- "Folded surface, by interface"
alphamissense <- "Within AlphaMissense bands"
bands <- names(e$byConfidenceBand)[startsWith(names(e$byConfidenceBand), "ipSAE")]
rows <- rbind(
  odds_row(residues, "All", e$all),
  odds_row(residues, sprintf("Folded (pLDDT ≥ %s)", summary$thresholds$plddt), e$ordered),
  odds_row(residues, "Folded and surface-exposed", e$orderedSurface),
  odds_row(matched, "Unmatched", summary$conservation$enrichment$orderedSurface$unmatched),
  odds_row(matched, "Within phyloP quarters", summary$conservation$enrichment$orderedSurface$matched),
  do.call(rbind, lapply(bands, function(b) odds_row(confidence, b, e$byConfidenceBand[[b]]))),
  odds_row(kind, "With another protein", e$byKind[["with other proteins (heterodimers)"]][[surface]]),
  odds_row(kind, "With a copy of itself", e$byKind[["with itself (homodimers)"]][[surface]]),
  do.call(rbind, lapply(names(e$byAlphaMissenseClass), function(b) {
    odds_row(alphamissense, sub("AlphaMissense ", "", b), e$byAlphaMissenseClass[[b]])
  }))
)
rows$group <- factor(rows$group, levels = unique(rows$group))
rows$label <- factor(rows$label, levels = rev(unique(rows$label)))

save(
  ggplot(rows, aes(odds, label)) +
    geom_vline(xintercept = 1, linetype = "dashed", colour = "grey55") +
    geom_errorbar(aes(xmin = low, xmax = high), orientation = "y", width = 0, colour = pathogenic_colour, linewidth = 0.8) +
    geom_point(colour = pathogenic_colour, size = 2.4) +
    scale_x_log10(breaks = c(0.5, 1, 2, 4), labels = as.character, limits = c(0.5, 5)) +
    facet_wrap(~group, ncol = 1, scales = "free_y", space = "free_y") +
    labs(x = "Odds ratio, pathogenic vs benign, at a predicted interface (log scale)", y = NULL),
  "enrichment",
  7
)

v <- summary$validation
bins <- length(v$all$histogram)
histogram <- function(label, x) {
  data.frame(
    series = sprintf("%s (%s pairs)", label, format(x$touching, big.mark = ",")),
    from = (seq_len(bins) - 1) * 100 / bins,
    share = unlist(x$histogram) / x$touching
  )
}
recall <- rbind(
  histogram("All pairs with a structure", v$all),
  histogram(sprintf("No structure deposited by %s", v$cutoff), v$unseen)
)
recall$series <- factor(recall$series, levels = unique(recall$series))

save(
  ggplot(recall, aes(from + 100 / bins / 2, share, fill = series)) +
    geom_col(position = position_dodge(width = 100 / bins * 0.9), width = 100 / bins * 0.85) +
    scale_fill_manual(values = c(interface_colour, pathogenic_colour)) +
    scale_x_continuous(breaks = seq(0, 100, 20), labels = function(x) paste0(x, "%")) +
    scale_y_continuous(labels = function(x) paste0(round(100 * x), "%")) +
    labs(x = "Share of the experimental interface the prediction covers", y = "Share of pairs") +
    theme(panel.grid.major.y = element_line(colour = "grey90"), panel.grid.major.x = element_blank()),
  "recall",
  3.6
)

median_patch <- "above the median patch"
modes <- c(dominant = "Dominant genes", recessive = "Recessive genes")
mode_colours <- c("Dominant genes" = interface_colour, "Recessive genes" = "#9cbde6")
by_mode <- summary$conservation$residues$patches$byInheritance
deep <- data.frame(
  mode = factor(modes, levels = modes),
  share = vapply(names(modes), function(m) by_mode[[m]][[median_patch]]$interface / by_mode[[m]]$complexes, numeric(1)),
  random = vapply(names(modes), function(m) by_mode[[m]][[median_patch]]$fake / by_mode[[m]]$complexes, numeric(1))
)
population <- do.call(rbind, lapply(names(modes), function(m) {
  x <- summary$gnomad$byInheritance[[m]]
  data.frame(
    mode = factor(modes[[m]], levels = modes),
    odds = x[["Mantel–Haenszel odds ratio"]],
    low = x[["95% CI (bootstrap over proteins)"]][[1]],
    high = x[["95% CI (bootstrap over proteins)"]][[2]]
  )
}))
percent_label <- function(x) paste0(round(100 * x), "%")
panel_theme <- theme(
  legend.position = "none",
  panel.grid.major.y = element_line(colour = "grey90"),
  panel.grid.major.x = element_blank(),
  plot.title = element_text(face = "bold", size = 13),
  plot.subtitle = element_text(colour = "grey35", size = 11)
)

save(
  (ggplot(deep, aes(mode, share, fill = mode)) +
    geom_col(width = 0.6) +
    geom_errorbar(aes(ymin = random, ymax = random), width = 0.6, linetype = "dashed", colour = "grey30") +
    geom_text(aes(label = percent_label(share)), vjust = -0.5, size = 4.2) +
    scale_fill_manual(values = mode_colours) +
    scale_y_continuous(labels = percent_label, limits = c(0, 1)) +
    labs(
      title = "Across 100 vertebrates (phyloP)",
      subtitle = "Share of complexes whose interface is more conserved\nthan the median surface patch; dashed: a random patch",
      x = NULL, y = NULL
    ) +
    panel_theme) +
    (ggplot(population, aes(mode, odds, colour = mode)) +
      geom_hline(yintercept = 1, linetype = "dashed", colour = "grey30") +
      geom_errorbar(aes(ymin = low, ymax = high), width = 0, linewidth = 1) +
      geom_point(size = 3) +
      scale_colour_manual(values = mode_colours) +
      scale_y_continuous(limits = c(0.8, 1.05)) +
      labs(
        title = "Among people today (gnomAD)",
        subtitle = "Missense-to-synonymous ratio at the interface,\nrelative to the rest of the surface; dashed: equal",
        x = NULL, y = NULL
      ) +
      panel_theme),
  "inheritance",
  3.8
)

region_names <- c(
  "buried core" = "Buried core",
  "interface" = "Interface",
  "exposed surface" = "Rest of the folded surface",
  "low confidence" = sprintf("Not confidently modelled (pLDDT < %s)", summary$thresholds$plddt)
)
region_colours <- setNames(c("#5b5a56", interface_colour, "#c9c7c0", "#ecebe6"), region_names)
placed <- do.call(rbind, lapply(c(pathogenic = "Pathogenic", benign = "Benign"), function(label) {
  counts <- vapply(names(region_names), function(r) summary$regions$regions[[r]][[tolower(label)]], numeric(1))
  data.frame(
    label = factor(label, levels = c("Benign", "Pathogenic")),
    region = factor(region_names, levels = rev(region_names)),
    share = counts / sum(counts)
  )
}))

save(
  ggplot(placed, aes(share, label, fill = region)) +
    geom_col(width = 0.6, colour = "white", linewidth = 0.4) +
    geom_text(
      aes(label = ifelse(share >= 0.06, percent_label(share), "")),
      position = position_stack(vjust = 0.5),
      colour = ifelse(placed$region %in% region_names[1:2], "white", "grey15"),
      size = 4
    ) +
    scale_fill_manual(values = region_colours, breaks = unname(region_names)) +
    scale_x_continuous(labels = percent_label, expand = c(0, 0)) +
    labs(x = "Share of ClinVar missense variants in proteins with a predicted complex", y = NULL) +
    guides(fill = guide_legend(nrow = 2)) +
    theme(plot.margin = margin(5, 20, 5, 5)),
  "regions",
  2.6
)
