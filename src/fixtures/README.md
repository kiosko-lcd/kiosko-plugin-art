# Test fixtures

Answers of the museums' APIs, saved on 26 November 2026 to test the parsers
and the picks. JSON only (and one trimmed HTML page); no images: the tests
draw their own.

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

Their data: The Met's is CC0; the Art Institute of Chicago's is CC0 (but
`description`, not saved here); the Rijksmuseum's is free to use; the
National Palace Museum's site texts are CC BY 4.0 (National Palace Museum,
Taipei, CC BY 4.0 @ www.npm.gov.tw).
