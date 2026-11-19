# Approximate GPS locality lookup

The admin Reports details show the nearest city or town in GeoNames' `cities1000` dataset, along with its distance from the saved GPS point. This is an approximate nearby locality, not a street address or proof of where someone was. The data may omit smaller settlements and is provided as-is.

The lookup runs entirely on the backend using a local copy of the dataset. Employee coordinates are not sent to GeoNames or another geocoding service. GeoNames data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the Reports page credits GeoNames.

## Dataset setup

The backend downloads the dataset automatically on startup if it is missing. The first startup needs outbound HTTPS access to GeoNames and may take a little longer. The dataset is then stored in `backend/data/cities1000.txt` for that deployment.

You can also download it manually from the backend directory:

```powershell
npm run download:localities
```

The generated dataset is not committed. If GeoNames is temporarily unreachable during startup, the API still starts and logs a warning; locality lookup will report that the data is missing until a later restart or a successful manual download.
