import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coords } from '@/lib/location';

export type MapArtisan = {
  id: string;
  full_name: string | null;
  profession: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  center: Coords;
  artisans: MapArtisan[];
  onSelect?: (id: string) => void;
  height?: number;
  fullScreen?: boolean;
};

const esc = (s: string | null) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// Carte OpenStreetMap (Leaflet) : aucune clé API requise.
export function ArtisanMap({ center, artisans, onSelect, height = 260, fullScreen = false }: Props) {
  const html = useMemo(() => {
    const data = JSON.stringify(
      artisans.map((a) => ({
        id: a.id,
        lat: a.latitude,
        lng: a.longitude,
        name: esc(a.full_name ?? 'Artisan'),
        job: esc(a.profession),
      })),
    ).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0}.me{background:#007AFF;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #007AFF55}.pin{background:#FF6B00;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px #0006}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var c=[${Number(center.latitude)},${Number(center.longitude)}];
var map=L.map('m',{zoomControl:true}).setView(c,13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
L.marker(c,{icon:L.divIcon({className:'me',iconSize:[16,16]})}).addTo(map).bindPopup('Vous');
var pts=[c];
${data ? `JSON.parse(${JSON.stringify(data)})` : '[]'}.forEach(function(a){
  var m=L.marker([a.lat,a.lng],{icon:L.divIcon({className:'pin',iconSize:[18,18]})}).addTo(map);
  m.bindPopup('<b>'+a.name+'</b><br>'+a.job);
  m.on('click',function(){window.ReactNativeWebView.postMessage(a.id)});
  pts.push([a.lat,a.lng]);
});
if(pts.length>1)map.fitBounds(pts,{padding:[30,30],maxZoom:15});
</script></body></html>`;
  }, [center.latitude, center.longitude, artisans]);

  return (
    <View style={[styles.box, fullScreen ? styles.fullScreen : { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        nestedScrollEnabled
        onMessage={(e: WebViewMessageEvent) => onSelect?.(e.nativeEvent.data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#e8e8e8' },
  fullScreen: { flex: 1, borderRadius: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
});
