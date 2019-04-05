# ProudCity Elastic Document API

## Dev

```
cd app
npm run dev
```

wp-config.php for mac
```
define('EP_HELPER_HOST', 'http://host.docker.internal:8084/send-attachments');
```

## Deploy

docker build -t proudwpsite_elasticdocapi .
docker tag proudwpsite_elasticdocapi gcr.io/proudcity-1184/proud-elastic-doc-api:kubernetes.6
gcloud docker -- push gcr.io/proudcity-1184/proud-elastic-doc-api:kubernetes.6