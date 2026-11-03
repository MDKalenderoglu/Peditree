# Other pedigree tools: notes for the comparison table

A raw notes file for the paper's comparison table, started 2026-11-03 with tablet support. Facts
come from public pages (links below) and may be dated: several products show no recent updates.
Check each against the vendor's current page before publishing.

## Tablet support

| Tool | Kind | Tablet | Notes |
|---|---|---|---|
| Progeny Clinical | Commercial, server database | iPad app exists, **for existing Progeny 10 clients only**, connecting to their own database. App Store version 1.2, last updated 2017 | Patients can fill questionnaires on a tablet in the waiting room |
| Proband (CHOP) | Free iPad app | **iPad only**, gesture-based drawing during the interview | Launched 2014; App Store page suggests no update since 2017 (requires iPadOS 9+). Studied in J Genet Couns 2018 |
| Invitae Family History Tool | Free, iPad + web | iPad and web (2014) | Data on Invitae's server (HIPAA). Current status not confirmed |
| PhenoTips / Open Pedigree | Commercial / open source (LGPL), browser | Runs in a browser; touch / tablet use not documented | Consanguinity detection; imports PED, GEDCOM, BOADICEA, FHIR |
| QuickPed | Free web app (research) | Not documented | Relatedness coefficients; aimed at research and teaching |
| CeGaT Pedigree Chart Designer | Free desktop app (Java) | **No**: download only, Windows / macOS / Linux | — |
| TrakGene | Commercial database | No iPad app found; pedigree drawing designed for mouse and keyboard (2014 report) | — |
| **PediTree** | Free, open source (Apache 2.0), browser, no server | Works in a tablet browser (touch: multi-select button, ring menu by tap); not yet tested on a real iPad | Patient data never leave the device; Turkish and English |

## Takeaways

- Real tablet tools exist (Proband, the Progeny app), but they are either old and unmaintained,
  or tied to a commercial server.
- A free, maintained, serverless tool that also runs on a tablet seems to be a gap.
- A claim like this in the paper needs a dated, careful check of each tool, and should be worded
  modestly.

## Sources

- [Progeny iPad app (blog)](https://www.progenygenetics.com/blog/download-the-new-progeny-ipad-app/) ·
  [Progeny app listing](https://appadvice.com/app/progeny/1164237685)
- [Proband on the App Store](https://apps.apple.com/us/app/-/id829791227) ·
  [CHOP announcement](https://research.chop.edu/cornerstone-blog/new-ipad-app-helps-construct-genetic-pedigrees) ·
  [Tablet use of Proband, J Genet Couns 2018](https://www.springermedizin.de/utilization-of-the-tablet-application-proband-in-pedigree-constr/15412264)
- [Invitae Family History Tool (2014)](https://ir.invitae.com/news-and-events/press-releases/press-release-details/2014/Invitae-Announces-the-Availability-of-its-Family-History-Tool--A-Free-Family-History-Collection-App--on-Apples-App-Store/default.aspx)
- [PhenoTips](https://marketplace.microsoft.com/en-gb/product/phenotips.core)
- [QuickPed](https://core.ac.uk/works/49243185)
- [CeGaT Pedigree Chart Designer](https://www.cegat.de/en/for-physicians/pedigree-chart-designer/)
- [TrakGene, paperless clinical genetics blog (2014)](https://paperlessclinicalgenetics.blogspot.com/2014/02)
