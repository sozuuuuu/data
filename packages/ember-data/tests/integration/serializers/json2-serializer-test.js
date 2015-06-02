var Post, post, Comment, Favorite, favorite, env;
var run = Ember.run;

module("integration/serializer/json2 - JSON2Serializer", {
  setup: function() {
    Post = DS.Model.extend({
      title: DS.attr('string'),
      comments: DS.hasMany('comment', { inverse: null })
    });
    Comment = DS.Model.extend({
      body: DS.attr('string'),
      post: DS.belongsTo('post')
    });
    Favorite = DS.Model.extend({
      post: DS.belongsTo('post', { async: true, polymorphic: true })
    });
    env = setupStore({
      post:     Post,
      comment:  Comment,
      favorite: Favorite,
      adapter: DS.RESTAdapter.extend({
        defaultSerializer: '-json2'
      })
    });
    env.store.modelFor('post');
    env.store.modelFor('comment');
    env.store.modelFor('favorite');
  },

  teardown: function() {
    run(env.store, 'destroy');
  }
});

test("extractArray normalizes each record in the array", function() {
  var postNormalizeCount = 0;
  var posts = [
    { id: "1", title: "Rails is omakase" },
    { id: "2", title: "Another Post" }
  ];

  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    normalize: function () {
      postNormalizeCount++;
      return this._super.apply(this, arguments);
    }
  }));

  run(function() {
    env.container.lookup("serializer:post").normalizeResponse(env.store, Post, posts, null, 'findAll');
  });
  equal(postNormalizeCount, 2, "two posts are normalized");
});

test('Serializer should respect the attrs hash when extracting records', function() {
  env.registry.register("serializer:post", DS.JSON2Serializer.extend({
    attrs: {
      title: "title_payload_key",
      comments: { key: 'my_comments' }
    }
  }));

  var jsonHash = {
    id: "1",
    title_payload_key: "Rails is omakase",
    my_comments: [1, 2]
  };

  var post = env.container.lookup("serializer:post").normalizeResponse(env.store, Post, jsonHash, '1', 'find');

  equal(post.data.attributes.title, "Rails is omakase");
  deepEqual(post.data.relationships.comments.data, [{ id: "1", type: "comment" }, { id: "2", type: "comment" }]);
});

test("Serializer should respect the primaryKey attribute when extracting records", function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    primaryKey: '_ID_'
  }));

  var jsonHash = { "_ID_": 1, title: "Rails is omakase" };

  run(function() {
    post = env.container.lookup("serializer:post").normalizeResponse(env.store, Post, jsonHash, '1', 'find');
  });

  equal(post.data.id, "1");
  equal(post.data.attributes.title, "Rails is omakase");
});

test("Serializer should respect the primaryKey attribute when serializing records", function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    primaryKey: '_ID_'
  }));

  run(function() {
    post = env.store.createRecord("post", { id: "1", title: "Rails is omakase" });
  });

  var payload = env.container.lookup("serializer:post").serialize(post._createSnapshot(), { includeId: true });

  equal(payload._ID_, "1");
});

test("Serializer should respect keyForAttribute when extracting records", function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    keyForAttribute: function(key) {
      return key.toUpperCase();
    }
  }));

  var jsonHash = { id: 1, TITLE: 'Rails is omakase' };

  post = env.container.lookup("serializer:post").normalize(Post, jsonHash);

  equal(post.data.id, "1");
  equal(post.data.attributes.title, "Rails is omakase");
});

test("Serializer should respect keyForRelationship when extracting records", function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    keyForRelationship: function(key, type) {
      return key.toUpperCase();
    }
  }));

  var jsonHash = { id: 1, title: 'Rails is omakase', COMMENTS: ['1'] };

  post = env.container.lookup("serializer:post").normalize(Post, jsonHash);

  deepEqual(post.data.relationships.comments.data, [{ id: "1", type: "comment" }]);
});

test("normalizePayload is called during extractSingle", function() {
  var counter = 0;

  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    normalizePayload: function(payload) {
      counter++;
      return payload.response;
    }
  }));

  var jsonHash = {
    response: {
      id: 1,
      title: "Rails is omakase"
    }
  };

  run(function() {
    post = env.container.lookup("serializer:post").normalizeResponse(env.store, Post, jsonHash, '1', 'find');
  });

  equal(counter, 1);
  equal(post.data.id, "1");
  equal(post.data.attributes.title, "Rails is omakase");
});

test("Calling normalize should normalize the payload (only the passed keys)", function () {
  expect(1);
  var Person = DS.Model.extend({
    posts: DS.hasMany('post')
  });
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    attrs: {
      notInHash: 'aCustomAttrNotInHash',
      inHash: 'aCustomAttrInHash'
    }
  }));

  env.registry.register('model:person', Person);

  Post.reopen({
    content: DS.attr('string'),
    author: DS.belongsTo('person'),
    notInHash: DS.attr('string'),
    inHash: DS.attr('string')
  });

  var normalizedPayload = env.container.lookup("serializer:post").normalize(Post, {
    id: '1',
    title: 'Ember rocks',
    author: 1,
    aCustomAttrInHash: 'blah'
  });

  deepEqual(normalizedPayload, {
    "data": {
      "id": "1",
      "type": "post",
      "attributes": {
        "inHash": "blah",
        "title": "Ember rocks"
      },
      "relationships": {
        "author": {
          "data": { "id": "1", "type": "person" }
        }
      }
    },
    "included": []
  });
});

test('serializeBelongsTo with async polymorphic', function() {
  var json = {};
  var expected = { post: '1', postTYPE: 'post' };

  env.registry.register('serializer:favorite', DS.JSON2Serializer.extend({
    serializePolymorphicType: function(snapshot, json, relationship) {
      var key = relationship.key;
      json[key + 'TYPE'] = snapshot.belongsTo(key).modelName;
    }
  }));

  run(function() {
    post = env.store.createRecord(Post, { title: 'Kitties are omakase', id: '1' });
    favorite = env.store.createRecord(Favorite, { post: post, id: '3' });
  });

  env.container.lookup('serializer:favorite').serializeBelongsTo(favorite._createSnapshot(), json, { key: 'post', options: { polymorphic: true, async: true } });

  deepEqual(json, expected, 'returned JSON is correct');
});

test('extractErrors respects custom key mappings', function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend({
    attrs: {
      title: 'le_title',
      comments: { key: 'my_comments' }
    }
  }));

  var payload = {
    errors: {
      le_title: ["title errors"],
      my_comments: ["comments errors"]
    }
  };

  var errors = env.container.lookup('serializer:post').extractErrors(env.store, Post, payload);

  deepEqual(errors, {
    title: ["title errors"],
    comments: ["comments errors"]
  });
});

test('extractErrors expects error information located on the errors property of payload', function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend());

  var payload = {
    attributeWhichWillBeRemovedinExtractErrors: ["true"],
    errors: {
      title: ["title errors"]
    }
  };

  var errors = env.container.lookup('serializer:post').extractErrors(env.store, Post, payload);

  deepEqual(errors, { title: ["title errors"] });
});

test('extractErrors leaves payload untouched if it has no errors property', function() {
  env.registry.register('serializer:post', DS.JSON2Serializer.extend());

  var payload = {
    untouchedSinceNoErrorsSiblingPresent: ["true"]
  };

  var errors = env.container.lookup('serializer:post').extractErrors(env.store, Post, payload);

  deepEqual(errors, { untouchedSinceNoErrorsSiblingPresent: ["true"] });
});
