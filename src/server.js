import express from "express";
import bodyParser from "body-parser";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import multer from "multer";
import * as fs from 'fs';

const app = express();
const mongoURI = "mongodb://localhost:27017";

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

var storage = multer.diskStorage({
  destination: "public/images",
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s/g, "-"));
  },
});
const uploadFile = multer({ storage: storage }).array("file");

const withDB = async (operations, res) => {
  try {
    // fire up mongodb client async
    const client = await MongoClient.connect(mongoURI, {
      useNewUrlParser: true,
    });
    // navigate to the correct db in mongo
    const db = client.db("portfolio");
    //specific request logic
    await operations(db);
    client.close();
  } catch (e) {
    res
      .status(500)
      .json({ message: "Something has gone tragically wrong :(", e });
  }
};

// ------------------------- GET ----------------------------------
// GET - Pieces:piece
app.get("/api/piece/:name/name", async (req, res) => {
  withDB(async (db) => {
    // grab url param :name and store it
    const pieceName = req.params.name;
    // pull up the correct collection and then find the object based off url param
    const pieceInfo = await db
      .collection("pieces")
      .findOne({ name: pieceName });
    // send status response and information
    res.status(200).json(pieceInfo);
  }, res);
});

// GET - by ID
app.get("/api/piece/:id", async (req, res) => {
  withDB(async (db) => {
    // need to use ObjectId() in order to convert to id that mongo can read? works.
    const id = req.params.id;
    const o_id = new ObjectId(id);
    const pieceInfo = await db.collection("pieces").findOne({ _id: o_id });
    res.status(200).json(pieceInfo);
  }, res);
});

// GET all pieces
app.get("/api/pieces", async (req, res) => {
  try {
    withDB(async (db) => {
      const pieces = await db.collection("pieces").find({}).toArray();
      res.status(200).json(pieces);
    }, res);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Something has gone tragically wrong :(", e });
  }
});

// GET all information
app.get("/api/info", async (req, res) => {
  try {
    withDB(async (db) => {
      const info = await db.collection("info").find({}).toArray();
      res.status(200).json(info);
    }, res);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Something has gone tragically wrong :(", e });
  }
});

// GET all of a certain category
app.get("/api/pieces/category/:category", async (req, res) => {
  try {
    let category = req.params.category;
  
    function titleCase(camelCase) {
      return camelCase
        .replace(/([A-Z])/g, (match) => ` ${match}`)
        .replace(/^./, (match) => match.toUpperCase())
        .trim();
    }
  
    const categoryCorrect = titleCase(category);

    withDB(async (db) => {
      const pieces = await db.collection("pieces").find({category: categoryCorrect}).toArray();
      res.status(200).json(pieces);
    }, res);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Something has gone tragically wrong :(", e });
  }
});


// GET all piece keys for table headers
// NOTES: couldn't use arrow functions because it locked this
// emit() does something with firing listeners. Don't fully understand
app.get("/api/piece-keys", async (req, res) => {
  withDB(async (db) => {
    const keys = await db.collection("pieces").mapReduce(
      function () {
        for (var key in this) {
          emit(key, null);
        }
      },
      function (key, value) {
        return null;
      },
      {
        out: "pieces_keys",
      }
    );

    const pieceKeys = await keys.distinct("_id");
    res.status(200).json(pieceKeys);
  }, res);
});

// GET all featured pieces
app.get("/api/featured-pieces", async (req, res) => {
  withDB(async (db) => {
    const featuredPieces = await db
      .collection("pieces")
      .find({ featured: true })
      .toArray();
    res.status(200).json(featuredPieces);
  }, res);
});

// GET - all images
app.get("/api/photos", async (req, res) => {
  withDB(async (db) => {
    const photos = await db.collection("photos.files").find().toArray();
    res.status(200).json(photos);
  }, res);
});

// ------------------------- POST ----------------------------------
// POST - Pieces:shortDescription
app.post("/api/pieces/:name/featured", async (req, res) => {
  withDB(async (db) => {
    // grab url param :name and store it
    const pieceName = req.params.name;
    // pull up the correct collection and then find the object based off url param
    const pieceInfo = await db
      .collection("pieces")
      .findOne({ name: pieceName });
    // update the db with the new information
    await db.collection("pieces").updateOne(
      { name: pieceName },
      {
        $set: {
          featured: req.body.text,
        },
      }
    );
    // call that new information now in the database
    const updatedPieceInfo = await db
      .collection("pieces")
      .findOne({ name: pieceName });
    // send status response and information
    res.status(200).json(updatedPieceInfo);
  }, res);
});

// POST - new piece
app.post("/api/pieces/add-piece", async (req, res) => {
  const { name } = req.body;

  withDB(async (db) => {
    const addPiece = await db.collection("pieces").insertOne({
      name,
    });
    const newPiece = await db.collection("pieces").findOne({ name: name });

    res.status(200).json(newPiece);
  }, res);
});

//POST - update the whole object, expects the whole object
app.post("/api/pieces/:title/update-piece", async (req, res) => {
  withDB(async (db) => {
    const pieceName = req.params.name;
    const pieceInfo = await db
      .collection("pieces")
      .findOne({ name: pieceName });
    await db.collection("pieces").updateOne(
      { title: pieceName },
      {
        $set: {
          name: req.body.name,
          title: req.body.title,
          images: req.body.images,
          alt: req.body.alt,
          shortDescription: req.body.shortDescription,
          longDescription: req.body.longDescription,
          features: req.body.features,
          featured: req.body.featured,
        },
      }
    );
    const updatedPieceInfo = await db
      .collection("pieces")
      .findOne({ name: pieceName });
    res.status(200).json(updatedPieceInfo);
  }, res);
});

//POST - update just one value
app.post("/api/pieces/:id/:key/update-piece", async (req, res) => {
  withDB(async (db) => {
    let dynamicSet = {};
    const id = req.params.id;
    const o_id = new ObjectId(id);
    dynamicSet[req.params.key] = req.body.value;
    const updatedPieceInfo = await db.collection("pieces").updateOne(
      { _id: o_id },
      {
        $set: dynamicSet,
      }
    );
    // const updatedPieceInfo = await db
    //   .collection("pieces")
    //   .findOne({ _id: o_id });
    res.status(200).json(updatedPieceInfo);
  }, res);
});

//POST - update just one value in info
app.post("/api/info/:id/:key/update-piece", async (req, res) => {
  withDB(async (db) => {
    let dynamicSet = {};
    const id = req.params.id;
    const o_id = new ObjectId(id);
    dynamicSet[req.params.key] = req.body.value;
    const updatedSiteInfo = await db.collection("info").updateOne(
      { _id: o_id },
      {
        $set: dynamicSet,
      }
    );
    res.status(200).json(updatedSiteInfo);
  }, res);
});

//POST - upload a picture
app.post("/api/upload", async (req, res) => {
  await uploadFile(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      res.status(500).json(err);
    } else if (err) {
      res.status(500).json(err);
    }

    res.json({ file: req.files });
  });
});

// ------------------------- DELETE ----------------------------------
// DELETE - delete one iamge from server
app.delete("/api/images/:image/delete-image", async (req, res) => {
  const path = req.params.image;
  fs.unlink(`./public/images/${path}`, (err) => {
    if (err) {
      res.status(500).json(err);
    } else {
      res.status(200).json({ result: true});
    };
  })
});

// DELETE - delete one piece
app.delete("/api/pieces/delete-piece", async (req, res) => {
  const { name } = req.body;
  withDB(async (db) => {
    const deletePiece = await db.collection("pieces").deleteOne({
      name,
    });

    res.status(200).json(`${name} has been deleted`);
  }, res);
});

app.listen(8000, () => console.log("Listening on port 8000"));
