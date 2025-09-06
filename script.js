let map;
let markers = [];

function showCalculator() {
  document.getElementById("cover").style.display = "none";
  document.getElementById("calculator").style.display = "block";
  initMap();
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 20.5937, lng: 78.9629 },
    zoom: 5,
  });
}

function calculateDistance() {
  const place1 = document.getElementById("place1").value;
  const place2 = document.getElementById("place2").value;
  const geocoder = new google.maps.Geocoder();

  if (!place1 || !place2) {
    alert("Please enter both places.");
    return;
  }

  markers.forEach(marker => marker.setMap(null));
  markers = [];

  geocoder.geocode({ address: place1 + ", India" }, (results1, status1) => {
    if (status1 === "OK") {
      const loc1 = results1[0].geometry.location;

      geocoder.geocode({ address: place2 + ", India" }, (results2, status2) => {
        if (status2 === "OK") {
          const loc2 = results2[0].geometry.location;

          markers.push(new google.maps.Marker({ position: loc1, map: map, title: place1 }));
          markers.push(new google.maps.Marker({ position: loc2, map: map, title: place2 }));

          const bounds = new google.maps.LatLngBounds();
          bounds.extend(loc1);
          bounds.extend(loc2);
          map.fitBounds(bounds);

          const distance = google.maps.geometry.spherical.computeDistanceBetween(loc1, loc2) / 1000;
          document.getElementById("distance").innerText = `Distance: ${distance.toFixed(2)} km`;
        } else {
          alert("Second place not found!");
        }
      });
    } else {
      alert("First place not found!");
    }
  });
}
