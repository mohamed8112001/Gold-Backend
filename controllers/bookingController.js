import { catchAsync } from "../utils/wrapperFunction.js";
import BookingTime from "../models/bookingTimeModel.js";
import Shop from "../models/shopModel.js";

export const addAvailableTime = catchAsync(async (req, res) => {
  const { date } = req.body;
  const shop = await Shop.findOne({ owner: req.user._id });

  if (!shop) {
    return res.status(400).json({ message: "Shop not found for this user" });
  }
  const existing = await BookingTime.findOne({ shop: shop._id, date });

  if (existing) {
    return res
      .status(400)
      .json({ message: "Slot already exists for this time" });
  }

  const newTime = await BookingTime.create({
    shop: shop._id,
    date,
  });
  res.status(201).json({ status: "success", data: newTime });
});

export const getAvailableTimesForShop = catchAsync(async (req, res) => {
  const { shopId } = req.params;
  console.log(shopId);
  const times = await BookingTime.find({
    shop: shopId,
    isBooking: false,
    date: { $gte: new Date() },
  });
  res.status(201).json({ status: "success", data: times });
});

export const bookTime = catchAsync(async (req, res) => {
  const { timeId } = req.body;
  const userId = req.user._id;

  const time = await BookingTime.findById(timeId);
  if(!time){
    return res.status(400).json({message: "Time not found"});
  }
  if(time.isBooking){
    return res.status(400).json({message: "Time already booked"});
  }
  time.isBooking = true;
  time.user = userId;
  await time.save();
  res.status(201).json({ status: "success", data: time });
});
