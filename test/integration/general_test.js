const {spawnSync} = require('child_process');
const dbName = 'oam-api-test';
const everest = 'https://github.com/openimagerynetwork/oin-meta-generator/blob/master/' +
      'test/fixtures/everest-utm.gtiff?raw=true';

function dropDatabase () {
  const child = spawnSync('mongo', [
    dbName,
    '--eval',
    'db.dropDatabase()'
  ]);
  if (child.stderr.toString() !== '') {
    console.error(child.stderr.toString());
    throw new Error(child.stderr.toString());
  }
}

function waitUntilGone (selector) {
  browser.waitForVisible(selector, 300000, true);
}

function finishLoading () {
  waitUntilGone('.loading');
}

function logIn () {
  browser.url('/');
  browser.click('a=Facebook');
  if (browser.getUrl().match(/facebook.com/)) {
    // Note that if you change the user, you will need to manually
    // step in at the point where you accept authorisation of the app.
    // ie: the bit where Facebook says something like, "This app would
    // like access to your personal, click 'Accept' to continue."
    $('#email').setValue('open_dtqgedz_user@tfbnw.net');
    $('#pass').setValue('oamtestpassword');
    browser.click('#loginbutton');
  }
  expect(browser.waitForVisible('a=Logout')).to.be.true;
}

// Use the following instead once IE Edge supports cookie and localStorage deletion.
// Or we move over to using JWT.
// browser.url('/'); // Cos we have to actually delete from a particular domain
// browser.deleteCookie();
// browser.localStorage('DELETE');
function logOut () {
  browser.url('/');
  if ($('a=Logout').isExisting()) {
    browser.click('a=Logout');
  }
}

function submitImagery (imageryUri, title = 'Test imagery') {
  logIn();
  browser.url('#/upload');
  fillInUploadForm(title);
  inputRemoteImageryUri(imageryUri);
  browser.click('button=Submit');
  return waitForImageryProcessing();
}

function waitForImageryProcessing () {
  let status = '';
  browser.waitForVisible('a=Check upload status.');
  browser.click('a=Check upload status.');
  browser.waitForVisible('h2=Status upload');
  for (var i = 0; i < 100; i++) {
    browser.waitForVisible('p.status');
    status = browser.getText('p.status').toLowerCase();
    if (status !== 'pending' && status !== 'processing') return status;
    browser.pause(1000);
    browser.refresh();
  }
  return false;
}

function fillInUploadForm (title) {
  $('#scene-0-title').setValue(title);
  $('#scene-0-sensor').setValue('Automated Test Sensor');
  $('#scene-0-provider').setValue('Automated Test Provider');
}

function inputRemoteImageryUri (imageryUri) {
  browser.click('button=Url');
  $('#scene-0-img-loc-0-url').setValue(imageryUri);
  // The URL button is pretty sensitive, sometimes you press
  // it and 2 inputs appear.
  if ($$('.bttn-remove-imagery').length === 2) {
    $$('.bttn-remove-imagery')[1].click();
  }
}

function getImageryResults () {
  const resultsSelector = '.pane-body-inner .results-list li';
  browser.waitForExist(resultsSelector);
  return $$(resultsSelector);
}

// TODO: Mock S3 and clear the local bucket
beforeEach(() => {
  dropDatabase();
  logOut();
});

describe('Map', function () {
  this.retries(3); // this requires function() not ()=>

  describe('Basic', function () {
    it('should find imagery over the Himalayas', () => {
      submitImagery(everest);
      browser.url('/');
      $('#global-search__input').setValue(['Mount Everest', 'Enter']);
      waitUntilGone('.autocomplete__menu-item*=Loading...');
      browser.click('.autocomplete__menu-item.is-highlighted');
      finishLoading();
      browser.click('#map');
      finishLoading();
      let results = getImageryResults();
      expect(results.length).to.be.at.least(1);
    });
  });
});

describe('User authentication', function () {
  this.retries(3); // this requires function() not ()=>

  describe('Logging in and out', function () {
    it('should log a user in with Facebook', () => {
      logIn();
      expect('img.profile_pic').to.be.there();
    });

    it('should log a user out', () => {
      logIn();
      expect('img.profile_pic').to.be.there();
      browser.click('a=Logout');
      expect('img.profile_pic').to.not.be.there();
    });
  });

  describe('Preventing access', function () {
    it('should not let you access the upload page', () => {
      browser.url('#/upload');
      expect('p*=You must be logged in').to.be.there();
      expect('p*=By submitting imagery to OpenAerialMap').to.not.be.there();
    });
  });

  describe('Allowing access', function () {
    it('should let you access the upload page', () => {
      logIn();
      browser.url('#/upload');
      expect('p*=You must be logged in').to.not.be.there();
      expect('p*=By submitting imagery to OpenAerialMap').to.be.there();
    });
  });
});

describe('Imagery', function () {
  this.retries(3); // this requires function() not ()=>

  describe('Basic imagery submission', function () {
    it('should submit imagery', () => {
      const title = Math.random().toString(36).slice(2);
      submitImagery(everest, title);
      browser.click('a=View image');
      getImageryResults();
      browser.click('.pane-body-inner .results-list li:first-child');
      expect('h1=' + title).to.be.there();
      const src = $('.single-media img').getAttribute('src');
      expect(src).to.match(/_thumb/);
      // TODO: In order to test the actual TMS we need to fire up the dynamic tiler locally
      // and use visual regression. Looks like there's already a nice wdio extension for
      // that: https://github.com/zinserjan/wdio-visual-regression-service
    });

    it('should submit a local file', () => {
      const title = Math.random().toString(36).slice(2);
      const localPath = `${__dirname}/fixtures/everest-utm.gtiff`;
      logIn();
      browser.url('#/upload');
      fillInUploadForm(title);
      browser.click('button=Local File');
      browser.chooseFile('#scene-0-img-loc-0-url', localPath);
      browser.click('button=Submit');
      waitForImageryProcessing();
      expect('a=View image').to.be.there();
    });
  });

  describe('Selected Layers', function () {
    // This has to be disabled, because in order to get the maxZoom the browser has to
    // query the TMS manifest, which is provided by the dynamic tiler. Currently we're using
    // the staging dynamic tiler that doesn't recognise the bucket/folder prefix that we use
    // to try and isolate imagery in test runs. The fix is to run an instance of the dynamic
    // tiler locally. There are no blockers to that, it just needs to be played with to get
    // working on Travis.
    it.skip('should allow zooming beyond 18 for high res tiles', () => {
      // Known high res imagery in Sanfrancisco
      const sanFran = '#/-122.409,37.735,18/0230102033332/58d7f0e7b0eae7f3b143c108?_k=ju8si1';
      browser.url(sanFran);
      finishLoading();
      expect('.button-zoom--in.disabled');
      // Click the 'TMS' button
      browser.waitForVisible('button=TMS');
      browser.click('button=TMS');
      // TODO: waiting here is necessary because of a blocking sync AJAX hack
      // in map.js getLayerMaxZoom().
      waitUntilGone('.button-zoom--in.disabled');
      const classes = $('.button-zoom--in').getAttribute('class');
      expect(classes).not.to.include('disabled');
    });
  });

  describe('Updating images', function () {
    it('should update an images title', () => {
      submitImagery(everest);
      browser.url('#/account');
      finishLoading();
      browser.click('a=Edit');
      finishLoading();
      $('#scene-0-title').setValue('A different title');
      browser.click('button=Submit');
      finishLoading();
      browser.url('#/account');
      finishLoading();
      expect('strong=A different title').to.be.there();
    });

    it('should delete an image', () => {
      submitImagery(everest, 'Delete me :(');
      browser.url('#/account');
      finishLoading();
      expect('strong=Delete me :(').to.be.there();
      browser.click('a=Delete');
      finishLoading();
      browser.url('#/account');
      finishLoading();
      expect('strong=Delete me :(').not.to.be.there();
    });
  });
});
