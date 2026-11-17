import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coords } from '@/lib/location';

export type MapArtisan = {
  id: string;
  entry_type?: 'artisan' | 'client';
  full_name: string | null;
  profession: string | null;
  avatar_url: string | null;
  latitude: number;
  longitude: number;
  business_type?: 'enterprise' | 'subcontractor' | null;
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

const safeImageUrl = (value: string | null) =>
  value && /^https?:\/\/[^\s"'<>]+$/i.test(value) ? esc(value) : '';

// Carte OpenStreetMap (Leaflet) : aucune clé API requise.
export function ArtisanMap({ center, artisans, onSelect, height = 260, fullScreen = false }: Props) {
  const [webViewFailed, setWebViewFailed] = useState(false);
  const html = useMemo(() => {
    const data = JSON.stringify(
      artisans.map((a) => ({
        id: a.id,
        type: a.entry_type ?? 'artisan',
        lat: a.latitude,
        lng: a.longitude,
        name: esc(a.full_name ?? 'Artisan'),
        job: esc(a.profession),
        avatar: safeImageUrl(a.avatar_url),
        businessType: a.business_type ?? null,
      })),
    ).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#m{height:100%;margin:0}body{background:#e8eef5}.me{background:#007AFF;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #007AFF55}.artisan-pin{position:relative;width:42px;height:42px;overflow:hidden;border:2px solid #fff;border-radius:50%;background:#FF6B00;box-shadow:0 1px 5px #0008;box-sizing:border-box}.artisan-pin img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}.artisan-pin span{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;color:#fff;font:bold 16px sans-serif}.client-pin{width:24px;height:24px;border:3px solid #fff;border-radius:50%;background:#7F56D9;box-shadow:0 1px 5px #0008}.map-error{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;color:#475467;text-align:center;font:14px/1.5 sans-serif}</style>
</head><body><div id="m"></div>
<script>
var center=[${Number(center.latitude)},${Number(center.longitude)}];
var artisans=JSON.parse(${JSON.stringify(data)});
function showMapError(){
  document.getElementById('m').innerHTML='<div class="map-error">Impossible de charger la carte. Vérifiez votre connexion Internet puis réessayez.</div>';
}
function drawMap(){
  try{
    var map=L.map('m',{zoomControl:true}).setView(center,13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    L.marker(center,{icon:L.divIcon({className:'me',iconSize:[16,16]})}).addTo(map).bindPopup('Vous');
    var points=[center];
    artisans.forEach(function(a){
      var isClient=a.type==='client';
      if(isClient){
        var clientMarker=L.divIcon({className:'',html:'<div class="client-pin"></div>',iconSize:[24,24],iconAnchor:[12,12]});
        var clientItem=L.marker([a.lat,a.lng],{icon:clientMarker}).addTo(map);
        clientItem.bindPopup('Client · demande active');
        points.push([a.lat,a.lng]);
        return;
      }
      var image=a.avatar?'<img src="'+a.avatar+'" onerror="this.style.display=\\'none\\'">':'';
      var marker=L.divIcon({className:'',html:'<div class="artisan-pin"><span>'+a.name.charAt(0).toUpperCase()+'</span>'+image+'</div>',iconSize:[42,42],iconAnchor:[21,21]});
      var item=L.marker([a.lat,a.lng],{icon:marker}).addTo(map);
      var businessLabel=a.businessType==='enterprise'?'Entreprise':a.businessType==='subcontractor'?'Sous-traitance':'';
      item.bindPopup('<b>'+a.name+'</b><br>'+a.job+(businessLabel?'<br><strong>'+businessLabel+' vérifiée</strong>':''));
      item.on('click',function(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(a.id)});
      points.push([a.lat,a.lng]);
    });
    if(points.length>1)map.fitBounds(points,{padding:[30,30],maxZoom:15});
  }catch(error){
    showMapError();
  }
}
function loadLeafletCss(index){
  var urls=['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'];
  if(index>=urls.length){showMapError();return}
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href=urls[index];
  link.onload=function(){loadLeafletJs(0)};
  link.onerror=function(){loadLeafletCss(index+1)};
  document.head.appendChild(link);
}
function loadLeafletJs(index){
  var urls=['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'];
  if(index>=urls.length){showMapError();return}
  var script=document.createElement('script');
  script.src=urls[index];
  script.onload=function(){if(window.L)drawMap();else loadLeafletJs(index+1)};
  script.onerror=function(){loadLeafletJs(index+1)};
  document.head.appendChild(script);
}
loadLeafletCss(0);
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
        onLoadStart={() => setWebViewFailed(false)}
        onError={(event) => {
          console.error('[map] Chargement WebView impossible:', event.nativeEvent.description);
          setWebViewFailed(true);
        }}
        onMessage={(e: WebViewMessageEvent) => onSelect?.(e.nativeEvent.data)}
      />
      {webViewFailed && (
        <View pointerEvents="none" style={styles.webError}>
          <Text style={styles.errorText}>Impossible de charger la carte. Vérifiez votre connexion Internet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#e8e8e8' },
  fullScreen: { flex: 1, borderRadius: 0 },
  web: { flex: 1, backgroundColor: '#e8eef5' },
  webError: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#e8eef5' },
  errorText: { color: '#475467', textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
