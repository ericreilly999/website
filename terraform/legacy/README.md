# terraform/legacy (frozen)

The original management-account root, moved here unchanged by Q-43 (B-Q43-02/03).
It keeps its S3 backend (`ericreilly-website-tfstate`, key `website/terraform.tfstate`)
and its state is untouched: only the two `source = "../modules/..."` paths changed, which
does not alter state addresses.

- Do not add resources here. New work goes in `terraform/envs/staging` and `terraform/envs/prod`.
- Run from this directory (`terraform init` / `plan`); it is not applied by any pipeline.
- Platform-bound files, to be handed to the platform owners with the `ericreilly.com` zone
  (inventory section 2.2): `ses-gencast.tf` (GenCast SES DKIM), `ses-drinkup-staging.tf` and
  `sendgrid-drinkup.tf` (DrinkUp mail records), `picks-site-dns.tf` (odds-analysis).
- The directory is deleted after cutover and owner-approved decommission (B-Q43-06, card T3-5).
