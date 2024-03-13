// Your access token can be found at: https://ion.cesium.com/tokens.
// This is the default access token from your ion account

const { html } = await import(
  "https://cdn.jsdelivr.net/gh/disberd/PlutoDevMacros/src/combine_htl/pluto_compat.js"
);

var extent = Cesium.Rectangle.fromDegrees(-2, -2, 2, 2);


Cesium.Camera.DEFAULT_VIEW_RECTANGLE = extent;
Cesium.Camera.DEFAULT_VIEW_FACTOR = 1.5;

// Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.SATELLITE
    )
  ),
  timeline: false,
  animation: false,
  creditContainer: document.createElement("none"), // remove the credits container
});

let parameters = {
  latitude: 0,
  longitude: 0,
  altitude: 15e5,
  roll: 0,
  pitch: 0,
  yaw: 0,
  theta: 0,
  phi: 0,
};

const satelliteEntity = viewer.entities.add({
  model: {
    uri: "satellite_with_axes.glb",
    scale: 1000000,
  },
});
const antennaEntity = viewer.entities.add({
  model: {
    uri: "parabola_with_axes.glb",
    scale: 1000000,
  },
});

const follow_checkbox = document.querySelector("input[name=follow-satellite]");
const toRad = (deg) => {
  return Cesium.Math.toRadians(deg);
};

let old_position = {
  latitude: parameters.latitude,
  longitude: parameters.longitude,
};

function updatePosition() {
  let { latitude, longitude, altitude } = parameters;
  // compute updated position
  const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
  // To move from ENU to WND we have to rotat 180° around the Y axis (Pitch)
  let orientation = Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(toRad(0), toRad(180), toRad(0))
  );
  let { roll, pitch, yaw } = parameters;
  // In Cesium heading is computed from North (Y axis) to East (X axis), which is the opposite of the usual convention of going from X to Y, so we invert the angle
  const wnd_to_attitude = Cesium.Quaternion.fromHeadingPitchRoll(
    new Cesium.HeadingPitchRoll(toRad(-yaw), toRad(-pitch), toRad(roll))
  );
  // const rpy_to_ant = Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(toRad(0), toRad(0), toRad(0)))
  Cesium.Quaternion.multiply(orientation, wnd_to_attitude, orientation);
  satelliteEntity.position = position;
  satelliteEntity.orientation = orientation;
  let { theta, phi } = parameters;
  Cesium.Quaternion.multiply(
    orientation,
    Cesium.Quaternion.fromHeadingPitchRoll(
      new Cesium.HeadingPitchRoll(toRad(-phi), toRad(-theta), toRad(0))
    ),
    orientation
  );
  antennaEntity.position = position;
  antennaEntity.orientation = orientation;
  // if (follow_checkbox.checked && (old_position.latitude != latitude || old_position.longitude != longitude)) {
  //    lockOnSatellite()
  // }
  old_position.latitude = latitude;
  old_position.longitude = longitude;
}

updatePosition();

for (let key of Object.keys(parameters)) {
  let container = document.getElementById(key);
  if (container == undefined) {
    continue;
  }
  let value;
  let slider = container.querySelector("input[type=range]");
  const vmin = parseFloat(slider.min);
  const vmax = parseFloat(slider.max);
  let text = container.querySelector("input[type=text]");
  const set_value = (x) => {
    let v = parseFloat(x);
    if (isNaN(v)) {
      return;
    }
    value = v < vmin ? vmin : v > vmax ? vmax : v;
    parameters[key] = value;
    updatePosition();
    slider.value = value;
    text.value = value;
  };
  container.set_value = set_value;
  slider.oninput = (e) => {
    set_value(slider.value);
  };
  text.oninput = (e) => {
    set_value(text.value);
  };
}

for (let btn of document.querySelectorAll(".reset_button")) {
  btn.onclick = (e) => {
    const container = btn.parentElement;
    for (let par of container.querySelectorAll(".parameter-container")) {
      par.set_value(0);
    }
  };
}

window.st = satelliteEntity;
window.viewer = viewer;
const scene = viewer.scene;
const camera = viewer.camera;
window.camera = camera;

function lockOnSatellite() {
  const position = satelliteEntity.position.getValue();
  let mag = Cesium.Cartesian3.magnitude(position);
  let norm = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
  let destination = Cesium.Cartesian3.multiplyByScalar(
    norm,
    mag + 10e6,
    new Cesium.Cartesian3()
  );
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  camera.flyTo({
    destination: destination,
    duration: 2,
    endTransform: transform,
  });
}
function unlockSatellite() {
  let destination = Cesium.Cartesian3.normalize(
    camera.positionWC,
    new Cesium.Cartesian3()
  );
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(destination);
  Cesium.Cartesian3.multiplyByScalar(destination, 30e6, destination);
  camera.flyTo({
    destination: destination,
    duration: 2,
    endTransform: transform,
  });
}

window.lockOnSatellite = lockOnSatellite;
window.unlockSatellite = unlockSatellite;

let follow_camera = follow_checkbox.checked;

scene.morphStart.addEventListener(function () {
  follow_camera = false;
});
scene.morphComplete.addEventListener(function () {
  follow_camera = follow_checkbox.checked;
});
/* This listener to keep camera while following a subject was taken from a the sandcastle example here:
https://sandcastle.cesium.com/?src=Cardboard.html which was referenced by this stackoverflow answer:
https://stackoverflow.com/questions/35066575/cesium-having-the-camera-in-an-entitys-first-person-view

I just removed some parts on the transform from orientation
*/
viewer.scene.postUpdate.addEventListener(function (scene, time) {
  if (!follow_camera) {
    return;
  }
  const entity = satelliteEntity;
  const position = entity.position.getValue(time);
  if (!Cesium.defined(position)) {
    return;
  }

  let transform;
  transform = Cesium.Transforms.eastNorthUpToFixedFrame(position);

  // Save camera state
  const offset = Cesium.Cartesian3.clone(camera.position);
  const direction = Cesium.Cartesian3.clone(camera.direction);
  const up = Cesium.Cartesian3.clone(camera.up);

  // Set camera to be in model's reference frame.
  camera.lookAtTransform(transform);

  // Reset the camera state to the saved state so it appears fixed in the model's frame.
  Cesium.Cartesian3.clone(offset, camera.position);
  Cesium.Cartesian3.clone(direction, camera.direction);
  Cesium.Cartesian3.clone(up, camera.up);
  Cesium.Cartesian3.cross(direction, up, camera.right);
});

lockOnSatellite()
follow_checkbox.oninput = (e) => {
  if (follow_checkbox.checked) {
    follow_camera = true;
    lockOnSatellite();
  } else {
    follow_camera = false;
    unlockSatellite();
  }
};
