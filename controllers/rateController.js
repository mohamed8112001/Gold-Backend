import ShopRating from "../models/shopRatingModel.js";
import Shop from "../models/shopModel.js";
import { catchAsync } from "../utils/wrapperFunction.js";
import mongoose from "mongoose";
import NotificationService from "../services/notificationService.js";
export const createRate = catchAsync(async (req, res) => {
  const { rating, comment } = req.body;
  const shopId = req.params.shopId;
  const userId = req.user.id;

  // Input validation
  if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      message: "Rating must be a valid number between 1 and 5",
    });
  }

  // Validate shopId format (assuming MongoDB ObjectId)
  if (!mongoose.Types.ObjectId.isValid(shopId)) {
    return res.status(400).json({ message: "Invalid shop ID format" });
  }

  console.log(shopId, userId, rating, comment);

  try {
    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    // Check if user already rated this shop
    const existingRating = await ShopRating.findOne({
      shop: shopId,
      user: userId,
    });

    let newRating;
    if (existingRating) {
      // Update existing rating
      existingRating.rating = Number(rating);
      existingRating.comment = comment?.trim() || "";
      existingRating.updatedAt = new Date();
      newRating = await existingRating.save();
      console.log("Updated existing rating");
    } else {
      // Create new rating
      newRating = await ShopRating.create({
        shop: shopId,
        user: userId,
        rating: Number(rating),
        comment: comment?.trim() || "",
      });
      console.log("Created new rating");
    }

    // Calculate and update shop average rating
    await updateShopAverageRating(shopId);

    // Create notification for shop owner
    try {
      const notification = await NotificationService.createRatingNotification(
        newRating,
        shopId,
        userId
      );
      if (notification) {
        console.log("Rating notification sent successfully to shop owner");
      } else {
        console.log("No notification sent - shop owner not found");
      }
    } catch (notificationError) {
      console.error("Failed to send rating notification:", notificationError);
      // Don't fail the rating creation if notification fails
    }

    res.status(201).json({
      success: true,
      data: newRating,
    });
  } catch (error) {
    console.error("Error creating rating:", error);
    res.status(500).json({
      message: "Failed to create rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export const getAllRates = catchAsync(async (req, res) => {
  const shopId = req.params.shopId;
  const userId = req.user.id;

  try {
    let ratings;

    if (shopId) {
      // Get ratings for specific shop
      // Validate shopId format
      if (!mongoose.Types.ObjectId.isValid(shopId)) {
        return res.status(400).json({ message: "Invalid shop ID format" });
      }

      // Verify shop exists
      const shop = await Shop.findById(shopId);
      if (!shop) {
        return res.status(404).json({ message: "Shop not found" });
      }

      ratings = await ShopRating.find({ shop: shopId })
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .lean();
    } else {
      // Get all ratings for shops owned by current user
      const userShops = await Shop.find({ owner: userId });
      const shopIds = userShops.map((shop) => shop._id);

      ratings = await ShopRating.find({ shop: { $in: shopIds } })
        .populate("user", "name email")
        .populate("shop", "name")
        .sort({ createdAt: -1 })
        .lean();
    }

    res.json({
      success: true,
      count: ratings.length,
      data: ratings,
    });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({
      message: "Failed to fetch ratings",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export const getRate = catchAsync(async (req, res) => {
  const ratingId = req.params.id;
  console.log(ratingId);
  // Validate rating ID format
  if (!mongoose.Types.ObjectId.isValid(ratingId)) {
    return res.status(400).json({ message: "Invalid rating ID format" });
  }

  try {
    const rating = await ShopRating.findById(ratingId)
      .populate("user", "name email")
      .populate("shop", "name")
      .lean();

    if (!rating) {
      return res.status(404).json({ message: "Rating not found" });
    }

    res.json({
      success: true,
      data: rating,
    });
  } catch (error) {
    console.error("Error fetching rating:", error);
    res.status(500).json({
      message: "Failed to fetch rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export const updateRate = catchAsync(async (req, res) => {
  const { rating, comment } = req.body;
  const ratingId = req.params.id;
  const userId = req.user.id;

  // Validate rating ID format
  if (!mongoose.Types.ObjectId.isValid(ratingId)) {
    return res.status(400).json({ message: "Invalid rating ID format" });
  }

  // Input validation
  if (rating && (isNaN(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({
      message: "Rating must be a valid number between 1 and 5",
    });
  }

  try {
    // Check if rating exists and belongs to the user
    const existingRating = await ShopRating.findById(ratingId);
    if (!existingRating) {
      return res.status(404).json({ message: "Rating not found" });
    }

    // Check ownership (users can only update their own ratings)
    if (existingRating.user.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You can only update your own ratings" });
    }

    const updatedRating = await ShopRating.findByIdAndUpdate(
      ratingId,
      {
        ...(rating && { rating: Number(rating) }),
        ...(comment !== undefined && { comment: comment.trim() }),
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    ).populate("user", "name email");

    // Recalculate shop average rating if rating value changed
    if (rating && rating !== existingRating.rating) {
      await updateShopAverageRating(existingRating.shop);
    }

    res.json({
      success: true,
      data: updatedRating,
    });
  } catch (error) {
    console.error("Error updating rating:", error);
    res.status(500).json({
      message: "Failed to update rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export const deleteRate = catchAsync(async (req, res) => {
  const ratingId = req.params.id;
  const userId = req.user.id;

  // Validate rating ID format
  if (!mongoose.Types.ObjectId.isValid(ratingId)) {
    return res.status(400).json({ message: "Invalid rating ID format" });
  }

  try {
    // Find rating and check ownership
    const rating = await ShopRating.findById(ratingId);
    if (!rating) {
      return res.status(404).json({ message: "Rating not found" });
    }

    // Check ownership (users can only delete their own ratings)
    if (rating.user.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own ratings" });
    }

    const deletedRating = await ShopRating.findByIdAndDelete(ratingId);

    // Update shop average rating after deletion
    await updateShopAverageRating(deletedRating.shop);

    res.status(200).json({
      success: true,
      message: "Rating deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting rating:", error);
    res.status(500).json({
      message: "Failed to delete rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Helper function to calculate and update shop average rating
const updateShopAverageRating = async (shopId) => {
  try {
    const ratings = await ShopRating.find({ shop: shopId });

    // Filter out invalid ratings and calculate average
    const validRatings = ratings
      .map((r) => Number(r.rating))
      .filter((rating) => !isNaN(rating) && rating >= 1 && rating <= 5);

    const average =
      validRatings.length > 0
        ? Math.round(
            (validRatings.reduce((sum, rating) => sum + rating, 0) /
              validRatings.length) *
              10
          ) / 10
        : 0;

    console.log(`Updating shop ${shopId} average rating to:`, average);

    await Shop.findByIdAndUpdate(shopId, {
      averageRating: average,
      rating: average, // Keep both for compatibility
      reviewCount: validRatings.length,
    });

    return average;
  } catch (error) {
    console.error("Error updating shop average rating:", error);
    throw error;
  }
};
