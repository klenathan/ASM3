# RMIT Society Context

## Glossary

- **Analytics Refresh Run**: One end-to-end analytics pipeline execution: export
  RDS data with Glue, query the snapshot with Athena, and persist dashboard
  metrics in RDS. A run is requested by a system administrator or the nightly
  schedule and ends as completed or failed.
