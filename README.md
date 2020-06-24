# OSM-Stats Wildcard API

An API that fetches the osm-stats group-summary and returns the aggregated stats values.


## Get wildcard stats

`GET /wildcard/:value`

Fetch the `http://osm-stats-production-api.azurewebsites.net/group-summaries/:value` and return the aggregated stats.

### Parameters

`Key` (query string)
> the wildcard, example hotosm-project-*

### Responses

**200** The stats are returned

```
{
  road_count_add: 5340938,
  road_count_mod: 5791078,
  building_count_add: 83932280,
  building_count_mod: 10372031,
  waterway_count_add: 3232745,
  poi_count_add: 164458,
  poi_count_mod: 214706,
  road_km_add: 2181153.4400000037,
  road_km_mod: 1407864.940000003,
  waterway_km_add: 315918.02999999945,
  waterway_km_mod: 178721.1400000001,
  edits: 112891827,
  users: 396603
}
```

## Deployment to AWS

Requirements: [cfn-config](https://github.com/mapbox/cfn-config)

```
cfn-config create <stack-name> cloudformation/wildcard-stats-api.template.js -t <template-bucket> -c <config-bucket>
```
