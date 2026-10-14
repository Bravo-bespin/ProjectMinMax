import Bungo from 'bungie-auth/electron';

const bungo = new Bungo({ /*.. config ..*/ });

bungo.token(function token(err, data) {
  console.log(data.accessToken.value); // CJ098da098df...
});