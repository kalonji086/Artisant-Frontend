import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { formatDistance, type Coords } from '@/lib/location';

export type MapArtisan = {
  id: string;
  full_name: string | null;
  profession: string | null;
  avatar_url?: string | null;
  is_online?: boolean | null;
  latitude: number;
  longitude: number;
  distance_m: number;
};

type Props = {
  center: Coords;
  artisans: MapArtisan[];
  userName?: string | null;
  userId?: string | null;
  userRole?: string | null;
  userAvatar?: string | null;
  userProfession?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
  fullScreen?: boolean;
};

// Carte OpenStreetMap (Leaflet) : aucune clé API requise. La page n'est chargée qu'une fois ;
// les artisans sont mis à jour par injection pour apparaître/disparaître sans rechargement.
export function ArtisanMap({
  center,
  artisans,
  userName,
  userId,
  userRole,
  userAvatar,
  userProfession,
  onSelect,
  height = 260,
  fullScreen = false,
}: Props) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const lat = center.latitude;
  const lng = center.longitude;
  const mapLat = Math.round(lat * 1000) / 1000;
  const mapLng = Math.round(lng * 1000) / 1000;

  const payload = useMemo(
    () =>
      JSON.stringify(
        artisans.map((a) => ({
          id: a.id,
          lat: a.latitude,
          lng: a.longitude,
          name: a.full_name ?? 'Artisan',
          img: a.avatar_url ?? '',
          on: !!a.is_online,
          distance: formatDistance(a.distance_m),
        })),
      ),
    [artisans],
  );
  const currentUser = useMemo(
    () =>
      JSON.stringify({
        name: userName ?? 'Vous',
        id: userId ?? '',
        role: userRole ?? '',
        avatar: userAvatar ?? '',
        profession: userProfession ?? '',
      }).replace(/</g, '\\u003c'),
    [userName, userId, userRole, userAvatar, userProfession],
  );

  const push = () => {
    ref.current?.injectJavaScript(`window.setArtisans && window.setArtisans(${JSON.stringify(payload)}); true;`);
  };

  useEffect(() => {
    if (ready.current) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#m{height:100%;margin:0}
.me{background:#007AFF;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 3px #007AFF55}
.me-photo{width:44px;height:44px;border:3px solid #007AFF;border-radius:50%;overflow:hidden;box-shadow:0 2px 6px #0007;background:#fff}
.me-photo img{width:100%;height:100%;object-fit:cover}
.leaflet-tooltip.name-label{border:0;border-radius:8px;box-shadow:0 2px 6px #0004;color:#222;font:600 12px system-ui;padding:5px 8px}
.leaflet-tooltip.name-label:before{display:none}
.leaflet-tooltip.me-label{background:#007AFF;color:#fff}
.av{position:relative;width:48px;height:48px}
.av img,.av .ph{width:44px;height:44px;border-radius:50%;border:3px solid #FF6B00;object-fit:cover;background:#ffe3cf;box-shadow:0 2px 6px #0007;box-sizing:content-box}
.av .dot{position:absolute;right:0;bottom:2px;width:12px;height:12px;border-radius:50%;border:2px solid #fff;background:#9aa0a6}
.av .dot.on{background:#34C759}
</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var c=[${mapLat},${mapLng}];
var map=L.map('m',{zoomControl:false}).setView(c,13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var currentUser=${currentUser};
var meNode;
if(currentUser.avatar){
  meNode=document.createElement('div');meNode.className='me-photo';
  var meImage=document.createElement('img');meImage.src=currentUser.avatar;meImage.alt='';
  meNode.appendChild(meImage);
}
var me=L.marker(c,{icon:currentUser.avatar
  ? L.divIcon({className:'',html:meNode.outerHTML,iconSize:[50,50],iconAnchor:[25,25]})
  : L.divIcon({className:'me',iconSize:[16,16]})}).addTo(map);
var meLabel=document.createElement('span');
meLabel.textContent=currentUser.name+(currentUser.role?' · '+currentUser.role:'')+(currentUser.profession?' · '+currentUser.profession:'');
me.bindTooltip(meLabel,{permanent:true,direction:'bottom',offset:[0,8],className:'name-label me-label'}).openTooltip();
if(currentUser.id&&currentUser.role==='Artisan'){
  me.on('click',function(){window.ReactNativeWebView.postMessage(currentUser.id)});
}
var markers={};var fitted=false;
function icon(a){
  var d=document.createElement('div');d.className='av';
  var i;
  if(a.img){i=document.createElement('img');i.setAttribute('src',a.img);}
  else{i=document.createElement('div');i.className='ph';}
  d.appendChild(i);
  var o=document.createElement('span');o.className='dot'+(a.on?' on':'');d.appendChild(o);
  return L.divIcon({className:'',html:d.outerHTML,iconSize:[48,48],iconAnchor:[24,24]});
}
window.setArtisans=function(json){
  var list=JSON.parse(json);var seen={};var pts=[c];
  list.forEach(function(a){
    seen[a.id]=1;pts.push([a.lat,a.lng]);
    var m=markers[a.id];
    if(m){m.setLatLng([a.lat,a.lng]);m.setIcon(icon(a));}
    else{
      m=L.marker([a.lat,a.lng],{icon:icon(a)}).addTo(map);
      m.on('click',function(){window.ReactNativeWebView.postMessage(a.id)});
      markers[a.id]=m;
    }
    var label=document.createElement('span');
    label.textContent=a.name+' · '+a.distance+' à vol d’oiseau';
    m.bindTooltip(label,{permanent:true,direction:'bottom',offset:[0,25],className:'name-label'}).openTooltip();
  });
  Object.keys(markers).forEach(function(id){if(!seen[id]){map.removeLayer(markers[id]);delete markers[id];}});
  if(!fitted&&pts.length>1){map.fitBounds(pts,{padding:[60,60],maxZoom:15});fitted=true;}
};
window.ReactNativeWebView.postMessage('__ready__');
</script></body></html>`,
    [mapLat, mapLng, currentUser],
  );

  return (
    <View style={[styles.box, fullScreen ? styles.full : { height, borderRadius: 12 }]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        nestedScrollEnabled
        onMessage={(e: WebViewMessageEvent) => {
          const data = e.nativeEvent.data;
          if (data === '__ready__') {
            ready.current = true;
            push();
          } else onSelect?.(data);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#e8e8e8' },
  full: { flex: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
});
