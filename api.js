import Bungo from 'bungie-auth/electron';

const bungie = new Bungo({
  key: 'f186a595620345c4b6c9a423521e3cd2',
  url: 'https://www.bungie.net/en/OAuth/Authorize'
});

bungie.token(function (err, paylaod) {
  if (err) throw err;

  const token = payload.accessToken.value;
  const authorization = `Bearer ${token}`;
});

bungie.token(function (err, payload) {

});

bungie.request(function (err, payload) {

});

bungie.refresh(token, function (err, payload) {

});

bungie.refresh(function (err, payload) {

});

const data = bungie.payload();

bungie.alive(bungie.accessToken) // 189

bungie.expired(bungie.accessToken) // false

const fn = bungie.capture(callback);
bungie.send('GetAccessTokenFromRefreshToken', { refreshToken: token }, fn);