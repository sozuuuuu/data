var HomePlanet, SuperVillain, EvilMinion, YellowMinion, DoomsdayDevice, MediocreVillain, env;
var run = Ember.run;

module("integration/active_model - ActiveModel2Serializer", {
  setup: function() {
    SuperVillain = DS.Model.extend({
      firstName:     DS.attr('string'),
      lastName:      DS.attr('string'),
      homePlanet:    DS.belongsTo("homePlanet"),
      evilMinions:   DS.hasMany("evilMinion")
    });
    HomePlanet = DS.Model.extend({
      name:          DS.attr('string'),
      superVillains: DS.hasMany('superVillain', { async: true })
    });
    EvilMinion = DS.Model.extend({
      superVillain: DS.belongsTo('superVillain'),
      name:         DS.attr('string')
    });
    YellowMinion = EvilMinion.extend();
    DoomsdayDevice = DS.Model.extend({
      name:         DS.attr('string'),
      evilMinion:   DS.belongsTo('evilMinion', { polymorphic: true })
    });
    MediocreVillain = DS.Model.extend({
      name:         DS.attr('string'),
      evilMinions:  DS.hasMany('evilMinion', { polymorphic: true })
    });
    env = setupStore({
      superVillain:   SuperVillain,
      homePlanet:     HomePlanet,
      evilMinion:     EvilMinion,
      yellowMinion:   YellowMinion,
      doomsdayDevice: DoomsdayDevice,
      mediocreVillain: MediocreVillain
    });
    env.store.modelFor('superVillain');
    env.store.modelFor('homePlanet');
    env.store.modelFor('evilMinion');
    env.store.modelFor('yellowMinion');
    env.store.modelFor('doomsdayDevice');
    env.store.modelFor('mediocreVillain');
    env.registry.register('serializer:application', DS.ActiveModel2Serializer);
    env.registry.register('serializer:-active-model', DS.ActiveModel2Serializer);
    env.registry.register('adapter:-active-model', DS.ActiveModelAdapter);
    env.amsSerializer = env.container.lookup("serializer:-active-model");
    env.amsAdapter    = env.container.lookup("adapter:-active-model");
  },

  teardown: function() {
    run(env.store, 'destroy');
  }
});

test("normalize", function() {
  SuperVillain.reopen({
    yellowMinion: DS.belongsTo('yellowMinion')
  });

  var superVillain_hash = {
    id: "1",
    first_name: "Tom",
    last_name: "Dale",
    home_planet_id: "123",
    evil_minion_ids: [1, 2]
  };

  var json = env.amsSerializer.normalize(SuperVillain, superVillain_hash, "superVillain");

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "super-villain",
      "attributes": {
        "firstName": "Tom",
        "lastName": "Dale"
      },
      "relationships": {
        "evilMinions": {
          "data": [
            { "id": "1", "type": "evil-minion" },
            { "id": "2", "type": "evil-minion" }
          ]
        },
        "homePlanet": {
          "data": { "id": "123", "type": "home-planet" }
        }
      }
    },
    "included": []
  });
});

test("normalize links", function() {
  var home_planet = {
    id: "1",
    name: "Umber",
    links: { super_villains: "/api/super_villians/1" }
  };


  var json = env.amsSerializer.normalize(HomePlanet, home_planet, "homePlanet");

  equal(json.data.relationships.superVillains.links.related, "/api/super_villians/1", "normalize links");
});

test("extractSingle", function() {
  env.registry.register('adapter:superVillain', DS.ActiveModelAdapter);

  var json_hash = {
    home_planet:   { id: "1", name: "Umber", super_villain_ids: [1] },
    super_villains:  [{
      id: "1",
      first_name: "Tom",
      last_name: "Dale",
      home_planet_id: "1"
    }]
  };

  var json;
  run(function() {
    json = env.amsSerializer.normalizeResponse(env.store, HomePlanet, json_hash, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "home-planet",
      "attributes": {
        "name": "Umber"
      },
      "relationships": {
        "superVillains": {
          "data": [
            { "id": "1", "type": "super-villain" }
          ]
        }
      }
    },
    "included": [{
      "id": "1",
      "type": "super-villain",
      "attributes": {
        "firstName": "Tom",
        "lastName": "Dale"
      },
      "relationships": {
        "homePlanet": {
          "data": { "id": "1", "type": "home-planet" }
        }
      }
    }]
  });
});

test("extractArray", function() {
  env.registry.register('adapter:superVillain', DS.ActiveModelAdapter);
  var array;

  var json_hash = {
    home_planets: [{ id: "1", name: "Umber", super_villain_ids: [1] }],
    super_villains: [{ id: "1", first_name: "Tom", last_name: "Dale", home_planet_id: "1" }]
  };

  run(function() {
    array = env.amsSerializer.normalizeResponse(env.store, HomePlanet, json_hash, null, 'findAll');
  });

  deepEqual(array, {
    "data": [{
      "id": "1",
      "type": "home-planet",
      "attributes": {
        "name": "Umber"
      },
      "relationships": {
        "superVillains": {
          "data": [
            { "id": "1", "type": "super-villain" }
          ]
        }
      }
    }],
    "included": [{
      "id": "1",
      "type": "super-villain",
      "attributes": {
        "firstName": "Tom",
        "lastName": "Dale"
      },
      "relationships": {
        "homePlanet": {
          "data": { "id": "1", "type": "home-planet" }
        }
      }
    }]
  });
});

test("serialize polymorphic", function() {
  var tom, ray;
  run(function() {
    tom = env.store.createRecord(YellowMinion, { name: "Alex", id: "124" });
    ray = env.store.createRecord(DoomsdayDevice, { evilMinion: tom, name: "DeathRay" });
  });

  var json = env.amsSerializer.serialize(ray._createSnapshot());

  deepEqual(json, {
    name: "DeathRay",
    evil_minion_type: "YellowMinion",
    evil_minion_id: "124"
  });
});

test("serialize polymorphic when type key is not camelized", function() {
  YellowMinion.modelName = 'yellow-minion';
  var tom, ray;
  run(function() {
    tom = env.store.createRecord(YellowMinion, { name: "Alex", id: "124" });
    ray = env.store.createRecord(DoomsdayDevice, { evilMinion: tom, name: "DeathRay" });
  });

  var json = env.amsSerializer.serialize(ray._createSnapshot());

  deepEqual(json["evil_minion_type"], "YellowMinion");
});

test("serialize polymorphic when associated object is null", function() {
  var ray, json;
  run(function() {
    ray = env.store.createRecord(DoomsdayDevice, { name: "DeathRay" });
    json = env.amsSerializer.serialize(ray._createSnapshot());
  });

  deepEqual(json["evil_minion_type"], null);
});

test("extractPolymorphic hasMany", function() {
  env.registry.register('adapter:yellowMinion', DS.ActiveModelAdapter);
  MediocreVillain.toString   = function() { return "MediocreVillain"; };
  YellowMinion.toString = function() { return "YellowMinion"; };

  var json_hash = {
    mediocre_villain: { id: 1, name: "Dr Horrible", evil_minions: [{ type: "yellow_minion", id: 12 }] },
    yellow_minions:    [{ id: 12, name: "Alex" }]
  };
  var json;

  run(function() {
    json = env.amsSerializer.normalizeResponse(env.store, MediocreVillain, json_hash, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "mediocre-villain",
      "attributes": {
        "name": "Dr Horrible"
      },
      "relationships": {
        "evilMinions": {
          "data": [
            { "id": "12", "type": "yellow-minion" }
          ]
        }
      }
    },
    "included": [{
      "id": "12",
      "type": "yellow-minion",
      "attributes": {
        "name": "Alex"
      },
      "relationships": {}
    }]
  });
});

test("extractPolymorphic", function() {
  env.registry.register('adapter:yellowMinion', DS.ActiveModelAdapter);
  EvilMinion.toString   = function() { return "EvilMinion"; };
  YellowMinion.toString = function() { return "YellowMinion"; };

  var json_hash = {
    doomsday_device: { id: 1, name: "DeathRay", evil_minion: { type: "yellow_minion", id: 12 } },
    yellow_minions:    [{ id: 12, name: "Alex", doomsday_device_ids: [1] }]
  };
  var json;

  run(function() {
    json = env.amsSerializer.normalizeResponse(env.store, DoomsdayDevice, json_hash, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "doomsday-device",
      "attributes": {
        "name": "DeathRay"
      },
      "relationships": {
        "evilMinion": {
          "data": { "id": "12", "type": "yellow-minion" }
        }
      }
    },
    "included": [{
      "id": "12",
      "type": "yellow-minion",
      "attributes": {
        "name": "Alex"
      },
      "relationships": {}
    }]
  });
});

test("extractPolymorphic when the related data is not specified", function() {
  var json = {
    doomsday_device: { id: 1, name: "DeathRay" },
    evil_minions:    [{ id: 12, name: "Alex", doomsday_device_ids: [1] }]
  };

  run(function() {
    json = env.amsSerializer.normalizeResponse(env.store, DoomsdayDevice, json, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "doomsday-device",
      "attributes": {
        "name": "DeathRay"
      },
      "relationships": {
        "evilMinion": {
          "data": null
        }
      }
    },
    "included": [{
      "id": "12",
      "type": "evil-minion",
      "attributes": {
        "name": "Alex"
      },
      "relationships": {}
    }]
  });
});

test("extractPolymorphic hasMany when the related data is not specified", function() {
  var json = {
    mediocre_villain: { id: 1, name: "Dr Horrible" }
  };

  run(function() {
    json = env.amsSerializer.normalizeResponse(env.store, MediocreVillain, json, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "mediocre-villain",
      "attributes": {
        "name": "Dr Horrible"
      },
      "relationships": {
        "evilMinions": {
          "data": []
        }
      }
    },
    "included": []
  });
});

test("extractPolymorphic does not break hasMany relationships", function() {
  var json = {
    mediocre_villain: { id: 1, name: "Dr. Evil", evil_minions: [] }
  };

  run(function () {
    json = env.amsSerializer.normalizeResponse(env.store, MediocreVillain, json, '1', 'find');
  });

  deepEqual(json, {
    "data": {
      "id": "1",
      "type": "mediocre-villain",
      "attributes": {
        "name": "Dr. Evil"
      },
      "relationships": {
        "evilMinions": {
          "data": []
        }
      }
    },
    "included": []
  });
});

test("extractErrors camelizes keys", function() {
  var payload = {
    errors: {
      first_name: ["firstName not evil enough"]
    }
  };

  run(function() {
    payload = env.amsSerializer.extractErrors(env.store, SuperVillain, payload);
  });

  deepEqual(payload, {
    firstName: ["firstName not evil enough"]
  });
});
