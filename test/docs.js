const t = require('../test-lib/test.js');
const assert = require('assert');
const _ = require('lodash');
let apos;

describe('Docs', function() {

  this.timeout(t.timeout);

  after(function() {
    return t.destroy(apos);
  });

  // EXISTENCE

  it('should be a property of the apos object', async function() {
    apos = await require('../index.js')({
      root: module,
      shortName: 'test',

      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
        },
        'test-people': {
          extend: 'apostrophe-doc-type-manager',
          name: 'test-person',
          addFields: [
            {
              name: '_friend',
              type: 'joinByOne',
              withType: 'test-person',
              idField: 'friendId',
              label: 'Friend'
            }
          ]
        }
      },
      argv: {
        _: []
      }
    });

    assert(apos.docs);
    apos.argv._ = [];

  });

  it('should have a db property', function() {
    assert(apos.docs.db);
  });

  /// ///
  // SETUP
  /// ///

  it('should make sure all of the expected indexes are configured', async function() {
    const expectedIndexes = [
      'type',
      'slug',
      'titleSortified',
      'tags',
      'published'
    ];
    const actualIndexes = [];

    const info = await apos.docs.db.indexInformation();
    // Extract the actual index info we care about.
    _.forEach(info, function(index) {
      actualIndexes.push(index[0][0]);
    });

    // Now make sure everything in expectedIndexes is in actualIndexes.
    _.forEach(expectedIndexes, function(index) {
      assert(_.includes(actualIndexes, index));
    });

    // Lastly, make sure there is a text index present
    assert(info.highSearchText_text_lowSearchText_text_title_text_searchBoost_text[0][1] === 'text');
  });

  it('should make sure there is no test data hanging around from last time', async function() {
    // Attempt to purge the entire aposDocs collection
    await apos.docs.db.remove({});

    // Make sure it went away
    const docs = await apos.docs.db.find({ slug: 'larry' }).toArray();

    assert(docs.length === 0);
  });

  it('should be able to use db to insert documents', async function() {
    const testItems = [
      {
        _id: 'lori',
        slug: 'lori',
        published: true,
        type: 'test-person',
        firstName: 'Lori',
        lastName: 'Pizzaroni',
        age: 32,
        alive: true
      },
      {
        _id: 'larry',
        slug: 'larry',
        published: true,
        type: 'test-person',
        firstName: 'Larry',
        lastName: 'Cherber',
        age: 28,
        alive: true
      },
      {
        _id: 'carl',
        slug: 'carl',
        published: true,
        type: 'test-person',
        firstName: 'Carl',
        lastName: 'Sagan',
        age: 62,
        alive: false,
        friendId: 'larry'
      }
    ];

    const response = await apos.docs.db.insert(testItems);

    assert(response.result.ok === 1);
    assert(response.insertedCount === 3);
  });

  it('should be able to carry out schema joins', async function() {
    const manager = apos.docs.getManager('test-person');
    const req = apos.tasks.getAnonReq();

    assert(manager);
    assert(manager.find);
    assert(manager.schema);

    const cursor = await manager.find(req, { slug: 'carl' });
    assert(cursor);

    const person = await cursor.toObject();

    assert(person);
    assert(person.slug === 'carl');
    assert(person._friend);
    assert(person._friend.slug === 'larry');
  });

  /// ///
  // UNIQUENESS
  /// ///

  it('should fail if you try to insert a document with the same unique key twice', async function() {
    try {
      const response = await apos.docs.db.insert([
        {
          type: 'test-person',
          published: false,
          age: 70,
          slug: 'peter'
        },
        {
          type: 'test-person',
          published: false,
          age: 70,
          slug: 'peter'
        }
      ]);
      assert(response.result.ok !== 1);
    } catch (e) {
      assert(e);
      assert(e.name === 'MongoError');
      assert(e.code === 11000);
    }
  });

  /// ///
  // FINDING
  /// ///

  it('should have a find method on docs that returns a cursor', function() {
    const cursor = apos.docs.find(apos.tasks.getAnonReq());

    assert(cursor);
    assert(cursor.__meta.name === 'apostrophe-cursor');
  });

  it('should be able to find all PUBLISHED test documents and output them as an array', async function () {
    const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' });

    const docs = await cursor.toArray();

    // There should be only 3 results.
    assert(docs.length === 3);
    // They should all have a type of test-person
    assert(docs[0].type === 'test-person');
  });

  /// ///
  // PROJECTIONS
  /// ///

  it('should be able to specify which fields to get by passing a projection object', async function() {
    const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' }, { age: 1 });
    const docs = await cursor.toArray();

    // There SHOULD be an age
    assert(docs[0].age);
    // There SHOULD NOT be a firstName
    assert(!docs[0].firstName);
  });

  /// ///
  // PUBLISHED vs UNPUBLISHED
  /// ///

  it('should be that non-admins DO NOT get unpublished docs by default', async function() {
    const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' });
    const docs = await cursor.toArray();

    _.forEach(docs, function(doc) {
      // There SHOULD NOT be a firstName
      assert(doc.published);
    });

    assert(docs.length === 3);
  });

  it('should be that non-admins do not get unpublished docs, even if they ask for them', async function() {
    const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' }).published(false);

    const docs = await cursor.toArray();
    assert(docs.length === 0);
  });

  it('should be that admins can get unpublished docs if they ask for them', async function () {
    const cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person' }).published(false);
    const docs = await cursor.toArray();

    assert(docs.length === 1);
    assert(!docs[0].published);
  });

  it('should be that admins can get a mixture of unpublished docs and published docs if they ask', async function() {
    const cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person' }).published(null);
    const docs = await cursor.toArray();

    assert(docs.length === 4);
  });

  // /// ///
  // // SORTING
  // /// ///

  // it('should be able to sort', function(done) {
  //   const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' }).sort({ age: 1 });
  //   cursor.toArray(function(err, docs) {
  //     assert(!err);
  //     assert(docs[0].slug === 'larry');
  //     done();
  //   });
  // });

  // it('should be able to sort by multiple keys', function(done) {
  //   const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person' }).sort({ firstName: 1, age: 1 });
  //   cursor.toArray(function(err, docs) {
  //     assert(!err);
  //     assert(docs[0].slug === 'carl');
  //     assert(docs[1].slug === 'larry');
  //     done();
  //   });
  // });

  // /// ///
  // // INSERTING
  // /// ///

  // it('should have an "insert" method that returns a new database object', function(done) {
  //   const object = {
  //     slug: 'one',
  //     published: true,
  //     type: 'test-person',
  //     firstName: 'Lori',
  //     lastName: 'Ferber',
  //     age: 15,
  //     alive: true
  //   };

  //   apos.docs.insert(apos.tasks.getReq(), object, function(err, object) {
  //     assert(!err);
  //     assert(object);
  //     assert(object._id);
  //     done();
  //   });
  // });

  // it('should be able to insert a new object into the docs collection in the database', function(done) {
  //   const cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person', slug: 'one' });
  //   cursor.toArray(function(err, docs) {
  //     assert(!err);
  //     assert(docs[0].slug === 'one');
  //     done();
  //   });
  // });

  // it('should append the slug property with a numeral if inserting an object whose slug already exists in the database', function(done) {
  //   const object = {
  //     slug: 'one',
  //     published: true,
  //     type: 'test-person',
  //     firstName: 'Harry',
  //     lastName: 'Gerber',
  //     age: 29,
  //     alive: true
  //   };

  //   apos.docs.insert(apos.tasks.getReq(), object, function(err, object) {
  //     assert(!err);
  //     assert(object);
  //     assert(object.slug.match(/^one\d+$/));
  //     done();
  //   });
  // });

  // it('should not allow you to call the insert method if you are not an admin', function(done) {
  //   const object = {
  //     slug: 'not-for-you',
  //     published: false,
  //     type: 'test-person',
  //     firstName: 'Darry',
  //     lastName: 'Derrber',
  //     age: 5,
  //     alive: true
  //   };

  //   apos.docs.insert(apos.tasks.getAnonReq(), object, function(err, object) {
  //     // did it return an error?
  //     assert(err);
  //     done();
  //   });
  // });

  // /// ///
  // // UPDATING
  // /// ///

  // it('should have an "update" method on docs that updates an existing database object based on the "_id" porperty', function(done) {
  //   apos.docs.find(apos.tasks.getReq(), { slug: 'one' }).toArray(function(err, docs) {
  //     assert(!err);
  //     // we should have a document
  //     assert(docs);
  //     // there should be only one document in our results
  //     assert(docs.length === 1);

  //     // grab the object
  //     const object = docs[0];
  //     // we want update the alive property
  //     object.alive = false;

  //     apos.docs.update(apos.tasks.getReq(), object, function(err, object) {
  //       assert(!err);
  //       assert(object);
  //       // has the property been updated?
  //       assert(object.alive === false);
  //       done();
  //     });
  //   });
  // });

  // it('should append an updated slug with a numeral if the updated slug already exists', function(done) {

  //   const cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person', slug: 'one' });
  //   cursor.toObject(function(err, doc) {
  //     assert(!err);
  //     assert(doc);

  //     doc.slug = 'peter';

  //     apos.docs.update(apos.tasks.getReq(), doc, function(err, doc) {
  //       assert(!err);
  //       assert(doc);
  //       // has the updated slug been appended?
  //       assert(doc.slug.match(/^peter\d+$/));
  //       done();
  //     });
  //   });
  // });

  // it('same thing, but with promises', function(done) {

  //   // We need to insert another, we used 'one' up
  //   const object = {
  //     slug: 'two',
  //     published: true,
  //     type: 'test-person',
  //     firstName: 'Twofy',
  //     lastName: 'Twofer',
  //     age: 15,
  //     alive: true
  //   };

  //   apos.docs.insert(apos.tasks.getReq(), object)
  //     .then(function(doc) {
  //       let cursor;
  //       assert(doc);
  //       assert(doc._id);
  //       cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person', slug: 'two' });
  //       return cursor.toObject();
  //     })
  //     .then(function(doc) {
  //       assert(doc);
  //       doc.slug = 'peter';
  //       return apos.docs.update(apos.tasks.getReq(), doc);
  //     })
  //     .then(function(doc) {
  //       assert(doc);
  //       // has the updated slug been appended?
  //       assert(doc.slug.match(/^peter\d+$/));
  //       done();
  //     })
  //     .catch(function(err) {
  //       assert(!err);
  //     });
  // });

  // it('should be able to fetch all unique firstNames with toDistinct', function() {
  //   return apos.docs.find(apos.tasks.getReq(), { type: 'test-person' }).toDistinct('firstName')
  //     .then(function(firstNames) {
  //       assert(Array.isArray(firstNames));
  //       assert(firstNames.length === 5);
  //       assert(_.includes(firstNames, 'Larry'));
  //     });
  // });

  // it('should be able to fetch all unique firstNames and their counts with toDistinct and distinctCounts', function() {
  //   const cursor = apos.docs.find(apos.tasks.getReq(), { type: 'test-person' }).distinctCounts(true);
  //   return cursor.toDistinct('firstName')
  //     .then(function(firstNames) {
  //       assert(Array.isArray(firstNames));
  //       assert(firstNames.length === 5);
  //       assert(_.includes(firstNames, 'Larry'));
  //       const counts = cursor.get('distinctCounts');
  //       assert(counts['Larry'] === 1);
  //       assert(counts['Lori'] === 2);
  //     });
  // });

  // it('should not allow you to call the update method if you are not an admin', function(done) {
  //   const cursor = apos.docs.find(apos.tasks.getAnonReq(), { type: 'test-person', slug: 'lori' });
  //   cursor.toObject(function(err, doc) {
  //     assert(!err);
  //     assert(doc);

  //     doc.slug = 'laurie';

  //     apos.docs.update(apos.tasks.getAnonReq(), doc, function(err, doc) {
  //       // did it return an error?
  //       assert(err);
  //       done();
  //     });
  //   });
  // });

  // /// ///
  // // TRASH
  // /// ///

  // it('should have a "trash" method on docs', function(done) {
  //   apos.docs.trash(apos.tasks.getReq(), { slug: 'carl' }, function(err) {
  //     assert(!err);
  //     done();
  //   });
  // });

  // it('should not be able to find the trashed object', function(done) {
  //   apos.docs.find(apos.tasks.getReq(), { slug: 'carl' }).toObject(function(err, doc) {
  //     assert(!err);
  //     // we should not have a document
  //     assert(!doc);
  //     done();
  //   });
  // });

  // it('should not allow you to call the trash method if you are not an admin', function(done) {
  //   apos.docs.trash(apos.tasks.getAnonReq(), { slug: 'lori' }, function(err) {
  //     assert(err);
  //     done();
  //   });
  // });

  // it('should be able to find the trashed object when using the "trash" method on find()', function(done) {
  //   apos.docs.find(apos.tasks.getReq(), { slug: 'carl' }).trash(true).toObject(function(err, doc) {
  //     assert(!err);
  //     // we should have a document
  //     assert(doc);
  //     done();
  //   });
  // });

  // /// ///
  // // RESCUE
  // /// ///

  // it('should have a "rescue" method on docs that removes the "trash" property from an object', function(done) {
  //   apos.docs.rescue(apos.tasks.getReq(), { slug: 'carl' }, function(err) {
  //     assert(!err);
  //     apos.docs.find(apos.tasks.getReq(), { slug: 'carl' }).toObject(function(err, doc) {
  //       assert(!err);
  //       // we should have a document
  //       assert(doc);
  //       done();
  //     });
  //   });
  // });

  // it('should not allow you to call the rescue method if you are not an admin', function(done) {
  //   apos.docs.rescue(apos.tasks.getAnonReq(), { slug: 'carl' }, function(err) {
  //     // was there an error?
  //     assert(err);
  //     done();
  //   });
  // });

  // /// ///
  // // EMPTY TRASH
  // /// ///

  // it('should have an "deconsteFromTrash" method on docs that removes specified objects from the database which have a "trash" property', function(done) {

  //   return async.series({
  //     trashCarl: function(callback) {
  //       return apos.docs.trash(apos.tasks.getReq(), { slug: 'carl' }, function(err) {
  //         assert(!err);
  //         return callback(null);
  //       });
  //     },
  //     deconsteFromTrash: function(callback) {
  //       return apos.docs.deconsteFromTrash(apos.tasks.getReq(), {}, function(err) {
  //         assert(!err);
  //         return callback(null);
  //       });
  //     },
  //     find: function(callback) {
  //       return apos.docs.find(apos.tasks.getReq(), { slug: 'carl' }).trash(true).toObject(function(err, doc) {
  //         assert(!err);
  //         // we should not have a document
  //         assert(!doc);
  //         return callback(null);
  //       });
  //     }
  //   }, done);
  // });

  // it('should not allow you to call the deconsteFromTrash method if you are not an admin', function(done) {
  //   return async.series({
  //     trashLarry: function(callback) {
  //       return apos.docs.trash(apos.tasks.getReq(), { slug: 'larry' }, function(err) {
  //         assert(!err);
  //         return callback(null);
  //       });
  //     },
  //     deconsteFromTrash: function(callback) {
  //       apos.docs.deconsteFromTrash(apos.tasks.getAnonReq(), {}, function(err) {
  //         assert(!err);
  //         return callback(null);
  //       });
  //     },
  //     find: function(callback) {
  //       return apos.docs.find(apos.tasks.getReq(), { slug: 'larry' }).trash(true).toObject(function(err, doc) {
  //         assert(!err);
  //         // we should have a document
  //         assert(doc);
  //         callback(null);
  //       });
  //     }
  //   }, done);
  // });

  // it('should throw an exception on find() if you fail to pass req as the first argument', function() {
  //   let exception;
  //   try {
  //     apos.docs.find({ slug: 'larry' });
  //   } catch (e) {
  //     exception = e;
  //   }
  //   assert(exception);
  // });

  // it('should respect explicitOrder()', function(done) {

  //   const testItems = [];
  //   let i;
  //   for (i = 0; (i < 100); i++) {
  //     testItems.push({
  //       _id: 'i' + i,
  //       slug: 'i' + i,
  //       published: true,
  //       type: 'test',
  //       title: 'title: ' + i
  //     });
  //   }

  //   return apos.docs.db.insert(testItems, function(err) {
  //     assert(!err);
  //     return apos.docs.find(apos.tasks.getAnonReq(), {}).explicitOrder([ 'i7', 'i3', 'i27', 'i9' ]).toArray(function(err, docs) {
  //       assert(!err);
  //       assert(docs[0]._id === 'i7');
  //       assert(docs[1]._id === 'i3');
  //       assert(docs[2]._id === 'i27');
  //       assert(docs[3]._id === 'i9');
  //       assert(!docs[4]);
  //       return done();
  //     });
  //   });

  // });

  // it('should respect explicitOrder with skip and limit', function(done) {

  //   // Relies on test data of previous test
  //   return apos.docs.find(apos.tasks.getAnonReq(), {}).explicitOrder([ 'i7', 'i3', 'i27', 'i9' ]).skip(2).limit(2).toArray(function(err, docs) {
  //     assert(!err);
  //     assert(docs[0]._id === 'i27');
  //     assert(docs[1]._id === 'i9');
  //     assert(!docs[2]);
  //     return done();
  //   });

  // });

  // it('should be able to lock a document', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.lock(req, 'i27', 'abc', function(err) {
  //     assert(!err);
  //     done();
  //   });
  // });

  // it('should not be able to lock a document with a different contextId', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.lock(req, 'i27', 'def', function(err) {
  //     assert(err);
  //     assert(err === 'locked');
  //     done();
  //   });
  // });

  // it('should be able to unlock a document', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.unlock(req, 'i27', 'abc', function(err) {
  //     assert(!err);
  //     done();
  //   });
  // });

  // it('should be able to re-lock an unlocked document', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.lock(req, 'i27', 'def', function(err) {
  //     assert(!err);
  //     done();
  //   });
  // });

  // it('should be able to lock a locked document with force: true', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.lock(req, 'i27', 'abc', { force: true }, function(err) {
  //     assert(!err);
  //     done();
  //   });
  // });

  // it('should be able to unlock all documents locked with the same contextId', function(done) {
  //   const req = apos.tasks.getReq();
  //   apos.docs.lock(req, 'i26', 'abc', function(err) {
  //     assert(!err);
  //     apos.docs.lock(req, 'i25', 'abc', function(err) {
  //       assert(!err);
  //       apos.docs.unlockAll(req, 'abc', function(err) {
  //         assert(!err);
  //         apos.docs.lock(req, 'i26', 'def', function(err) {
  //           assert(!err);
  //           done();
  //         });
  //       });
  //     });
  //   });
  // });

});
