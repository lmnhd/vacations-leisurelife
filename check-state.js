fetch(`http://localhost:3000/api/groups/campaign/film-and-zine-afloat-2026/media/manifest?t=${Date.now()}`)
  .then(r => r.json())
  .then(m => {
     console.log('Top keys:', Object.keys(m));
     console.log('Manifest keys:', Object.keys(m.manifest || {}));
     console.log('Ships:', m.manifest?.images?.shipReferences?.map(r => r.assetId + ' -> ' + r.curation?.approvalState));
  });