# Native PowerPoint rendering

PaperDOM includes an **interactive Windows rendering workflow** using Microsoft PowerPoint itself. The hosted Cloudflare Worker cannot run Office. The workflow is implemented, but no real PowerPoint output has been produced or visually verified in this environment.

## Render a concrete export

1. Export the deck as PPTX. Keep that exact file; regenerated ZIP files can have different hashes.
2. On a Windows desktop with licensed PowerPoint, close existing PowerPoint windows. Run:

```powershell
powershell -File scripts/render-powerpoint.ps1 -InputFile C:\decks\review.pptx -OutputDirectory C:\decks\review-native -Video
```

3. The script opens the file read-only with macros disabled, exports every slide as PNG, exports a PDF, and optionally renders MP4. It records the PowerPoint version/build, source SHA-256, dimensions, slide count and hashes of all outputs. It refuses to overwrite an existing output directory and does not emit a success manifest if rendering fails.
4. Check evidence against the exact source:

```sh
node scripts/verify-native-render.mjs review.pptx review-native/native-render.json --video
```

5. Review the PDF/PNG and video in addition to checking integrity. Hash verification proves file correspondence, not visual equivalence or renderer authenticity. Compare fonts, wrapping, line spacing, crop, masters, object positions, opacity, transition timing, triggers and media. The generated PDF/PNG are static slide views; they do not prove animation playback. PowerPoint video uses recorded timings/narrations and a five-second default slide duration; click-driven playback also needs interactive inspection.

Do not install this COM script as an unattended web service. Microsoft documents limitations of non-interactive Office automation. A hosted native-rendering service would require a separately provisioned, licensed and supported rendering environment; none is configured in PaperDOM.

## Preserving native layout and animation

PPTX import retains original packages up to **8 MiB compressed** inside `powerPointSource`. The existing editable importer accepts up to 30 MB compressed; larger source packages are not retained and the import report says so. Retention is bounded because PaperDOM snapshots are cloned, saved as JSON and shared through R2. Large local JSON snapshots may exceed browser local-storage quotas; the save indicator reports that failure, and JSON export/shared storage remain available.

If title, pages, masters, library and theme are unchanged, ordinary PPTX export returns the **exact original bytes**. Native layout, animations, embedded fonts, media, unknown parts and relationships therefore survive an unchanged round trip without conversion. Revision timestamps do not invalidate this path. Model changes switch export to regenerated editable content. There is no claim of full fidelity for that conversion. The retained source SHA-256 is checked before reuse, and the content fingerprint is stable through JSON normalization.

Regenerated exports write standard PresentationML timing for appear, fade in/out, fly in, zoom, spin, pulse and straight-line move, plus fade/push slide transitions and timed advance. An object rendered as separate shape/text pieces receives synchronized behaviors on both. Components without a direct exported object target do not receive native timing. The importer reads the corresponding simple behavior subset and reports unsupported timing. Custom paths, paragraph animation, interactive triggers, Morph, arbitrary easing and complete PowerPoint layout conversion remain outside this subset. Timing XML has automated structural and browser import coverage; actual Microsoft PowerPoint playback remains unverified.

## Sources

- [PowerPoint ExportAsFixedFormat](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.presentation.exportasfixedformat)
- [PowerPoint CreateVideo](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.presentation.createvideo)
- [PowerPoint media task status](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.ppmediataskstatus)
- [PresentationML AnimateEffect](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.animateeffect?view=openxml-3.0.1)
- [Microsoft’s server-side Office automation guidance](https://support.microsoft.com/en-us/visio/considerations-for-server-side-automation-of-office)
