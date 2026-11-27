# Test fixtures

Answers of the museums' APIs, saved on 26 November 2026 to test the parsers
and the picks (and on 27 November, those about frames, boxes, cases, covers
and albums). JSON only (and trimmed HTML pages); no images: the tests draw
their own.

| File | Request |
|---|---|
| `met-search-count.json`, `met-search-5000.json` | `GET collectionapi.metmuseum.org/public/collection/v1.1/search?medium=Paintings&hasImages=true&isPublicDomain=true&q=*&offset=0\|5000&limit=1` |
| `met-search-v1-retired.json` | `GET …/v1/search?hasImages=true&q=*` (410 Gone since 2026-10-01) |
| `met-object-437300.json` | `GET …/v1/objects/437300` (Pissarro, public domain) |
| `met-object-not-pd.json` | `GET …/v1/objects/488227` (Picasso, not public domain: no image) |
| `aic-search-first.json`, `aic-search-last.json` | `POST api.artic.edu/api/v1/artworks/search`: public-domain paintings with an image, sorted by id, ascending / descending, 1 |
| `aic-search-417.json` | the same, `from: 417`, with the fields the plugin asks for |
| `aic-search-too-far.json` | the same, `from: 1500` (refused: it pages up to 1,000) |
| `rijks-search-189x.json` | `GET data.rijksmuseum.nl/search/collection?type=painting&imageAvailable=true&creationDate=189?` |
| `rijks-edm-200100988.json` | `GET data.rijksmuseum.nl/200100988?_profile=edm-framed&_mediatype=application/ld+json` |
| `rijks-iiif-info-mPymb.json` | `GET iiif.micr.io/mPymb/info.json` |
| `npm-search-34.html` | `POST digitalarchive.npm.gov.tw/opendata/Pub/Search` (paintings, page 34), trimmed to the result cards and the page count |
| `npm-manifest-506.json` | `GET digitalarchive.npm.gov.tw/Integrate/GetJson?cid=506&dept=P`, trimmed to its first three views |
| `npm-manifest-35226.json`, `npm-manifest-35407.json` | the same for two works of the Republic (1944, and one dated by its title only), left out; first view only |
| `npm-iiif-info-K2A000817.json` | `GET iiifod.npm.gov.tw/iiif/2/K2A%2FK2A000817N000000000PAA/info.json` |
| `npm-search-120.html`, `npm-search-882.html` | the same search, pages 120 (an album as a whole among its leaves) and 882 (pieces of the curio cabinets, department `U`), trimmed the same way |
| `npm-manifest-62013.json` | `妙境常新 冊` (department `U`): its first views are a box with a catalogue label; first three views |
| `npm-manifest-4287.json`, `npm-manifest-4288.json` | an album as a whole (title and colophon pages only; first three views) and its first leaf (all four) |
| `npm-manifest-29105.json` | a set of four hanging scrolls as a whole: its box; first two views |
| `npm-manifest-5722.json`, `npm-manifest-14887.json` | two handscrolls, their views listed backwards (the scroll rolled up first; a whole-length strip, then the wrapper); all views |
| `met-object-189655.json`, `met-object-286154.json`, `met-object-646672.json`, `met-object-631212.json`, `met-object-824560.json`, `met-object-334108.json` | `GET …/v1/objects/{id}`: a frame, a photograph album, a print album, a Claude glass in its case, a paste-paper book cover, and a print made as a portfolio cover (Toulouse-Lautrec's *Elles*) |
| `aic-artworks-objects.json` | `GET api.artic.edu/api/v1/artworks?ids=23529,105932,88258,12512,61598,22708,234877&fields=…` (the plugin's fields): boxes, an album, an album cover, a book binding; a printed album cover and a painting in its artist's frame |
| `rijks-edm-20028306.json`, `rijks-edm-20052986.json`, `rijks-edm-200106093.json`, `rijks-edm-200344192.json`, `rijks-edm-200117739.json` | EDM records of a frame, a painted box, a photograph album, a photograph in its case and a printed book cover |

Their data: The Met's is CC0; the Art Institute of Chicago's is CC0 (but
`description`, not saved here); the Rijksmuseum's is free to use; the
National Palace Museum's site texts are CC BY 4.0 (National Palace Museum,
Taipei, CC BY 4.0 @ www.npm.gov.tw).
