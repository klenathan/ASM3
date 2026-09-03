# RMIT Society Context

## Glossary

- **Analytics Refresh Run**: One end-to-end analytics pipeline execution: export
  RDS data with Glue, query the snapshot with Athena, and persist dashboard
  metrics in RDS. A run is requested by a system administrator or the nightly
  schedule and ends as completed or failed.
- **Thread Location Attachment**: An optional attachment on one new thread that references one selected Mapbox place and is displayed with the thread.
- **Verified Location Snapshot**: The server-validated Mapbox place identity, coordinates, and address metadata persisted with a thread; client coordinates may only fine-tune the canonical place within a bounded threshold.
- **Search Proximity Hint**: A temporary coordinate used only to bias place search; browser geolocation requires explicit user action and is never persisted.
