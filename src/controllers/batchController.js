const { Batch, Product, ProvenanceEvent, User, sequelize } = require("../models");
const { logCreate, logUpdate, logDelete } = require("../utils/auditLogger");
const { Op } = require("sequelize");
const crypto = require("crypto");

// Create a new batch
const createBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      batch_number,
      product_id,
      quantity,
      unit,
      parent_batch_id,
      metadata,
    } = req.body;

    // Check if batch number exists
    const existingBatch = await Batch.findOne({ 
      where: { batch_number },
      transaction,
    });
    
    if (existingBatch) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Batch number already exists",
      });
    }

    // Verify product exists
    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // If parent batch exists, verify it
    if (parent_batch_id) {
      const parentBatch = await Batch.findByPk(parent_batch_id, { transaction });
      if (!parentBatch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Parent batch not found",
        });
      }
    }

    const batch = await Batch.create({
      batch_number,
      product_id,
      quantity,
      unit: unit || "pieces",
      parent_batch_id: parent_batch_id || null,
      status: "active",
    }, { transaction });

    await transaction.commit();

    await logCreate(
      req.user.id,
      "batch",
      batch.id,
      { batch_number, product_id, quantity },
      req,
      `Created batch: ${batch_number} for product ${product.name}`
    );

    res.status(201).json({
      success: true,
      message: "Batch created successfully",
      data: batch,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating batch:", error);
    res.status(500).json({
      success: false,
      message: "Error creating batch",
      error: error.message,
    });
  }
};

// Get all batches
const getAllBatches = async (req, res) => {
  try {
    const { page = 1, limit = 20, product_id, status, search } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (product_id) whereClause.product_id = product_id;
    if (status) whereClause.status = status;
    if (search) {
      whereClause[Op.or] = [
        { batch_number: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Batch.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: Product, 
          as: "product",
          attributes: ["id", "name", "product_code", "category"],
        },
        {
          model: Batch,
          as: "parentBatch",
          attributes: ["id", "batch_number", "quantity"],
        },
        {
          model: Batch,
          as: "childBatches",
          attributes: ["id", "batch_number", "quantity", "status"],
        },
      ],
      limit: limitNum,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching batches",
      error: error.message,
    });
  }
};

// Get batch by ID
const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await Batch.findByPk(id, {
      include: [
        { 
          model: Product, 
          as: "product",
          include: [
            { model: User, as: "manufacturer", attributes: ["id", "full_name", "company_name"] },
          ],
        },
        {
          model: Batch,
          as: "parentBatch",
        },
        {
          model: Batch,
          as: "childBatches",
        },
      ],
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    res.status(200).json({
      success: true,
      data: batch,
    });
  } catch (error) {
    console.error("Error fetching batch:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching batch",
      error: error.message,
    });
  }
};

// Split a batch into multiple smaller batches
const splitBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { childBatches } = req.body; // Array of { batch_number, quantity }

    const parentBatch = await Batch.findByPk(id, { transaction });
    if (!parentBatch) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Parent batch not found",
      });
    }

    if (parentBatch.status !== "active") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot split batch with status: ${parentBatch.status}`,
      });
    }

    // Calculate total quantity of child batches
    const totalChildQuantity = childBatches.reduce((sum, child) => sum + child.quantity, 0);
    
    if (totalChildQuantity > parentBatch.quantity) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Child batches total quantity (${totalChildQuantity}) exceeds parent batch quantity (${parentBatch.quantity})`,
      });
    }

    // Create child batches
    const createdBatches = [];
    for (const child of childBatches) {
      const existingBatch = await Batch.findOne({
        where: { batch_number: child.batch_number },
        transaction,
      });
      
      if (existingBatch) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Batch number ${child.batch_number} already exists`,
        });
      }

      const newBatch = await Batch.create({
        batch_number: child.batch_number,
        product_id: parentBatch.product_id,
        quantity: child.quantity,
        unit: parentBatch.unit,
        parent_batch_id: parentBatch.id,
        status: "active",
      }, { transaction });
      
      createdBatches.push(newBatch);
    }

    // Update parent batch status if fully split
    const remainingQuantity = parentBatch.quantity - totalChildQuantity;
    if (remainingQuantity === 0) {
      await parentBatch.update({ status: "split" }, { transaction });
    }

    await transaction.commit();

    await logCreate(
      req.user.id,
      "batch_split",
      parentBatch.id,
      { parent_batch: parentBatch.batch_number, children: childBatches.map(c => c.batch_number) },
      req,
      `Split batch ${parentBatch.batch_number} into ${createdBatches.length} child batches`
    );

    res.status(200).json({
      success: true,
      message: "Batch split successfully",
      data: {
        parent_batch: parentBatch,
        child_batches: createdBatches,
        remaining_quantity: remainingQuantity,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error splitting batch:", error);
    res.status(500).json({
      success: false,
      message: "Error splitting batch",
      error: error.message,
    });
  }
};

// Merge multiple batches into one
const mergeBatches = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { batch_ids, new_batch_number } = req.body;

    if (!batch_ids || batch_ids.length < 2) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "At least 2 batches are required to merge",
      });
    }

    // Get all batches to merge
    const batches = await Batch.findAll({
      where: { id: batch_ids },
      transaction,
    });

    if (batches.length !== batch_ids.length) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "One or more batches not found",
      });
    }

    // Verify all batches are from same product
    const productId = batches[0].product_id;
    const sameProduct = batches.every(b => b.product_id === productId);
    
    if (!sameProduct) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot merge batches from different products",
      });
    }

    // Verify all batches are active
    const inactiveBatches = batches.filter(b => b.status !== "active");
    if (inactiveBatches.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot merge inactive batches: ${inactiveBatches.map(b => b.batch_number).join(", ")}`,
      });
    }

    // Calculate total quantity
    const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);

    // Check if new batch number exists
    const existingBatch = await Batch.findOne({
      where: { batch_number: new_batch_number },
      transaction,
    });
    
    if (existingBatch) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "New batch number already exists",
      });
    }

    // Create merged batch
    const mergedBatch = await Batch.create({
      batch_number: new_batch_number,
      product_id: productId,
      quantity: totalQuantity,
      unit: batches[0].unit,
      parent_batch_id: null,
      status: "active",
    }, { transaction });

    // Mark original batches as merged
    for (const batch of batches) {
      await batch.update({ status: "merged" }, { transaction });
    }

    await transaction.commit();

    await logCreate(
      req.user.id,
      "batch_merge",
      mergedBatch.id,
      { merged_batch: new_batch_number, source_batches: batches.map(b => b.batch_number) },
      req,
      `Merged ${batches.length} batches into ${new_batch_number}`
    );

    res.status(200).json({
      success: true,
      message: "Batches merged successfully",
      data: {
        merged_batch: mergedBatch,
        source_batches: batches,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error merging batches:", error);
    res.status(500).json({
      success: false,
      message: "Error merging batches",
      error: error.message,
    });
  }
};

// Update batch
const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, status, metadata } = req.body;

    const batch = await Batch.findByPk(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const oldValues = {
      quantity: batch.quantity,
      status: batch.status,
    };

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (status) updateData.status = status;

    await batch.update(updateData);

    await logUpdate(
      req.user.id,
      "batch",
      id,
      oldValues,
      updateData,
      req,
      `Updated batch: ${batch.batch_number}`
    );

    res.status(200).json({
      success: true,
      message: "Batch updated successfully",
      data: batch,
    });
  } catch (error) {
    console.error("Error updating batch:", error);
    res.status(500).json({
      success: false,
      message: "Error updating batch",
      error: error.message,
    });
  }
};

// Delete batch
const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await Batch.findByPk(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Check if batch has child batches
    const childBatches = await Batch.count({ where: { parent_batch_id: id } });
    if (childBatches > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete batch that has child batches. Delete child batches first.",
      });
    }

    const batchData = { batch_number: batch.batch_number, quantity: batch.quantity };
    await batch.destroy();

    await logDelete(
      req.user.id,
      "batch",
      id,
      batchData,
      req,
      `Deleted batch: ${batchData.batch_number}`
    );

    res.status(200).json({
      success: true,
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting batch:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting batch",
      error: error.message,
    });
  }
};

module.exports = {
  createBatch,
  getAllBatches,
  getBatchById,
  splitBatch,
  mergeBatches,
  updateBatch,
  deleteBatch,
};