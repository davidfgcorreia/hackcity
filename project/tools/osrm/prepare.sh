#!/bin/sh
# Download + clip the OSM data for the Cascais operating area into /data (volume osrm_data).
# Re-runnable: the Portugal download is cached; delete /data/cascais.* to rebuild the graph.
set -eu
cd /data
PBF=portugal-latest.osm.pbf
BBOX="-9.53,38.63,-9.10,38.83"   # Cascais to central Lisbon, including GPS starts near Campolide
if [ ! -s "$PBF" ]; then
  echo "downloading $PBF (Geofabrik, ~350 MB)"
  curl -fL --retry 3 -o "$PBF.part" "https://download.geofabrik.de/europe/portugal-latest.osm.pbf"
  mv "$PBF.part" "$PBF"
fi
echo "clipping to $BBOX"
osmium extract --overwrite -b "$BBOX" -o cascais.osm.pbf "$PBF"
echo "clip ready: /data/cascais.osm.pbf ($(du -h cascais.osm.pbf | cut -f1))"
