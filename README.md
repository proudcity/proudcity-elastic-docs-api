# ProudCity Elastic Document API

## Dev

```
cd app
npm run dev
```

wp-config.php for mac, pointed at the authenticated route (see PCD269):
```
define('EP_HELPER_AUTH_HOST', 'http://host.docker.internal:8084/send-attachments-auth');
define('EP_HELPER_USER', '<API_AUTH_USER>');
define('EP_HELPER_PASS', '<API_AUTH_PASS>');
```

The unauthenticated `/send-attachments` route (driven by `EP_HELPER_HOST`) was
removed in PCD269 phase E.2. Every caller must use `/send-attachments-auth`
with Basic auth.

## Deploy

Cloud Build is connected to GitHub and fires on push to any branch. It
builds and pushes `gcr.io/proudcity-1184/github.com/proudcity/proudcity-elastic-docs-api:$COMMIT_SHA`
(the bare 40-character commit SHA, no other tag). There's no cloudbuild
file in the repo, and nothing deploys automatically, even on `master`.

Pushing a work branch builds a testable image without touching production.
Deploying it is a manual rollout in the `elasticsearch` namespace:

```sh
kubectl -n elasticsearch set image deploy/docsapi docsapi=gcr.io/proudcity-1184/github.com/proudcity/proudcity-elastic-docs-api:<sha>
kubectl -n elasticsearch rollout status deploy/docsapi
```

Confirm the build succeeded first with:

```sh
gcloud builds list --project proudcity-1184 --limit 3
```

The checked-in manifest `proudcity-kubernetes/elasticsearch/node-deployment.yml`
pins whatever SHA was last deployed; keep it up to date after a rollout so a
blind `kubectl apply` doesn't roll the deployment backward.
