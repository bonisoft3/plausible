// The committed log, pulled in as the `Event` seed, and the tzdata as `Zone`.
//
// The generator ran once, by hand; these two files are the artifact. Embedding
// them here rather than restating rows in CUE is what lets DuckDB, the sidecar
// and the app all read the SAME bytes — which is the whole of why the oracle is
// independent of the app.
@extern(embed)

package plausible

_events: _ @embed(file="fixtures/events.json")
_zones:  _ @embed(file="fixtures/zones.json")
