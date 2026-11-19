# Approximate GPS locality lookup

The admin Reports details show the nearest city or town in GeoNames' `cities1000` dataset, along with its distance from the saved GPS point. This is an approximate nearby locality, not a street address or proof of where someone was. The data may omit smaller settlements and is provided as-is.

The lookup runs entirely on the backend using a local copy of the dataset. Employee coordinates are not sent to GeoNames or another geocoding service. GeoNames data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the Reports page credits GeoNames.

## Install the dataset

Download the dataset before starting the backend:

```powershell
npm run download:localities
```

For Render, set the backend service's **Build Command** to:

```text
npm install && npm run download:localities
```

Keep the existing start command. The generated `data/cities1000.txt` is not committed; Render recreates it as part of each build. If the dataset is missing, the admin lookup displays an explicit setup error rather than silently presenting coordinates as a place name.
