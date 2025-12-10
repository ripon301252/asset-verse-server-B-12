require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w0nmtjl.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("asset_vers");
    const assetCollection = db.collection("asset_list");
    const assetRequestCollection = db.collection("asset_requests");
    const usersCollection = db.collection("users");

    console.log("MongoDB connected successfully!");

    // ==========================
    // ASSETS ROUTES
    // ==========================

    // Get all assets
    app.get("/assets", async (req, res) => {
      try {
        const assets = await assetCollection.find({}).toArray();
        res.status(200).json(assets);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch assets" });
      }
    });

    // Get single asset
    app.get("/assets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const asset = await assetCollection.findOne({ _id: new ObjectId(id) });
        if (!asset) return res.status(404).json({ message: "Asset not found" });
        res.json(asset);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch asset" });
      }
    });

    // Add new asset
    app.post("/assets", async (req, res) => {
      try {
        const asset = req.body;
        asset.name = asset.name.toLowerCase().trim();
        const result = await assetCollection.insertOne(asset);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Update Asset
    // Update Asset
    app.put("/assets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { name, quantity, image, type } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid asset ID" });
        }

        if (!name || quantity == null || !type) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const updateDoc = {
          $set: {
            name: name.toLowerCase().trim(),
            quantity: Number(quantity),
            image: image || null,
            type, // type include করা হলো
          },
        };

        console.log("Update request body:", req.body); // Debug

        const result = await assetCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        console.log("Update result:", result); // Debug

        if (result.matchedCount === 0)
          return res.status(404).json({ message: "Asset not found" });

        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        console.error("Update Error:", err);
        res
          .status(500)
          .json({ message: "Failed to update asset", error: err.message });
      }
    });

    // Delete asset
    app.delete("/assets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await assetCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ message: "Asset deleted", result });
      } catch (err) {
        res.status(500).json({ message: "Delete failed" });
      }
    });

    // ==========================
    // ASSET REQUEST ROUTES
    // ==========================

    // Get all requests
    app.get("/asset_requests", async (req, res) => {
      try {
        const requests = await assetRequestCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.json(requests);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // Add request
    app.post("/asset_requests", async (req, res) => {
      try {
        const { assetId, quantity, reason, userName, email } = req.body;
        const asset = await assetCollection.findOne({
          _id: new ObjectId(assetId),
        });

        if (!asset) return res.status(400).json({ message: "Asset not found" });

        const request = {
          assetId,
          assetName: asset.name,
          quantity: Number(quantity),
          reason: reason || "",
          status: "pending",
          createdAt: new Date(),
          userName: userName || "Anonymous",
          email: email || "unknown",
        };

        const result = await assetRequestCollection.insertOne(request);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // Approve request
    app.put("/asset_requests/:id/approve", async (req, res) => {
      try {
        const id = req.params.id;
        const request = await assetRequestCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!request)
          return res.status(404).json({ message: "Request not found" });

        const asset = await assetCollection.findOne({
          _id: new ObjectId(request.assetId),
        });
        if (!asset) return res.status(404).json({ message: "Asset not found" });

        if (asset.quantity < request.quantity)
          return res.status(400).json({ message: "Not enough stock" });

        await assetCollection.updateOne(
          { _id: asset._id },
          { $inc: { quantity: -request.quantity } }
        );
        await assetRequestCollection.updateOne(
          { _id: request._id },
          { $set: { status: "approved" } }
        );

        res.json({ message: "Request approved" });
      } catch (err) {
        res.status(500).json({ message: "Approval failed" });
      }
    });

    // Reject request
    app.put("/asset_requests/:id/reject", async (req, res) => {
      try {
        const id = req.params.id;
        await assetRequestCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.json({ message: "Request rejected" });
      } catch (err) {
        res.status(500).json({ message: "Reject failed" });
      }
    });

    // Delete request
    app.delete("/asset_requests/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await assetRequestCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ message: "Request deleted", result });
      } catch (err) {
        res.status(500).json({ message: "Delete failed" });
      }
    });

    // ==========================
    // USERS ROUTES
    // ==========================

    // Get all users
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find({}).toArray();
        res.json(users);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch users" });
      }
    });

    // Get single user by id
    app.get("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid user ID" });

        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch user" });
      }
    });

    // Delete user
    app.delete("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ message: "User deleted", result });
      } catch (err) {
        res.status(500).json({ message: "Delete failed" });
      }
    });

    // Get user role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ role: "user" });
        res.json({ role: user.role || "user" });
      } catch (err) {
        res.status(500).json({ role: "user" });
      }
    });

    // Update user
    // app.put("/users/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const { name, email, role, status, team } = req.body;

    //     const updateDoc = {
    //       $set: { name, email, role, status },
    //     };

    //     // যদি team change করতে চাও
    //     if (team) updateDoc.$set.team = team;

    //     const result = await usersCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       updateDoc
    //     );

    //     if (result.matchedCount === 0)
    //       return res.status(404).json({ message: "User not found" });

    //     res.json({ modifiedCount: result.modifiedCount });
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).json({ message: "Update failed" });
    //   }
    // });

    // Update user
    app.put("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // এখানে photoURL add করা হলো
        const { name, email, role, status, team, photoURL } = req.body;

        const updateDoc = {
          $set: { name, email, role, status },
        };

        // যদি team থাকে
        if (team) updateDoc.$set.team = team;

        // 🔥 গুরুত্বপূর্ণ — ছবি আপডেট করো যদি নতুন URL আসে
        if (photoURL) updateDoc.$set.photoURL = photoURL;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0)
          return res.status(404).json({ message: "User not found" });

        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed" });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user.name || !user.email || !user.role) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const result = await usersCollection.insertOne(user);

        console.log("Inserted User Result:", result); // <-- এখানে console এ দেখাও

        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error("Insert Error:", err);
        res.status(500).json({ message: err.message });
      }
    });

    // Delete request
    app.delete("/asset_requests/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await assetRequestCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ deletedCount: result.deletedCount }); // ✅
      } catch (err) {
        res.status(500).json({ message: "Delete failed" });
      }
    });

    //  strip Create Checkout Session
    app.post("/api/stripe/create-checkout-session", async (req, res) => {
      try {
        const { hrId, packageType, amount } = req.body;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: `AssetVerse ${packageType} Package` },
                unit_amount: amount * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.CLIENT_URL}/packageUpgrade/upgrade-success?session_id={CHECKOUT_SESSION_ID}&hrId=${hrId}&packageType=${packageType}`,
          cancel_url: `${process.env.CLIENT_URL}/packageUpgrade/upgrade-cancel`,
        });

        res.json({ url: session.url });
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Stripe session creation failed" });
      }
    });

    // Verify Payment & Update HR Package (dummy DB)
    let HR_DB = []; // Demo database

    app.get("/api/stripe/success", async (req, res) => {
      const { session_id, hrId, packageType } = req.query;

      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === "paid") {
          // Update package in dummy DB
          let packageLimit = 5;
          if (packageType === "Standard") packageLimit = 20;
          if (packageType === "Premium") packageLimit = 50;

          // Update HR DB
          let hr = HR_DB.find((h) => h.id === hrId);
          if (hr) {
            hr.packageType = packageType;
            hr.packageLimit = packageLimit;
          } else {
            HR_DB.push({ id: hrId, packageType, packageLimit });
          }

          return res.json({ success: true, packageType, packageLimit });
        }

        res.json({ success: false });
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Error verifying payment." });
      }
    });

    // backend/routes/assets.js (pie)
    app.get("/api/dashboard/pie", async (req, res) => {
      try {
        const data = await assetCollection
          .aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }])
          .toArray();

        res.json(data);
      } catch (err) {
        res.status(500).json({ message: "Server Error" });
      }
    });

    // backend/routes/requests.js (bar)
    app.get("/api/dashboard/bar", async (req, res) => {
      try {
        const requests = await assetRequestCollection.find().toArray();

        const countMap = {};

        requests.forEach((r) => {
          countMap[r.assetName] = (countMap[r.assetName] || 0) + 1;
        });

        const result = Object.entries(countMap)
          .map(([name, count]) => ({ _id: name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        res.json(result);
      } catch (err) {
        res.status(500).json({ message: "Server Error" });
      }
    });

    // ping
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // No need to close client in a long-running server
  }
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => {
  res.send("AssetVerse Backend Running!");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
