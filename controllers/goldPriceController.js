import express from 'express';
import fetch from 'node-fetch';
import { catchAsync } from '../utils/wrapperFunction.js';
import Product from '../models/productModel.js';
const GOLD_API_URL = 'https://api.gold-api.com/price/XAU';
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';
const OUNCE_TO_GRAM = 31.1035;

// Fetch USD to EGP exchange rate
async function getExchangeRateToEGP() {
    const response = await fetch(EXCHANGE_RATE_API);
    const data = await response.json();
    if (!data.rates?.EGP) throw new Error('Failed to fetch USD to EGP rate');
    return data.rates.EGP;
}
async function fetchGoldPrice() {
    const response = await fetch(GOLD_API_URL);
    const data = await response.json();

    if (!data || !data.price) {
        throw new Error('Failed to fetch gold price from Gold-API.com');
    }

    const pricePerGramUsd = data.price / OUNCE_TO_GRAM;
    return pricePerGramUsd;
}

export const price_gram = catchAsync(async (req, res) => {
    const { karat } = req.params;
    const pricePerGramUsd = await fetchGoldPrice();
    const egpRate = await getExchangeRateToEGP();

    const karatPercentage = parseInt(karat) / 24;
    const priceUsd = pricePerGramUsd * karatPercentage;
    const priceEgp = priceUsd * egpRate;

    res.json({
        price_per_gram_usd: priceUsd.toFixed(2),
        price_per_gram_egp: priceEgp.toFixed(2),
        egp_rate: egpRate,
        karat: `${karat}k`,
    });
});

export async function calculateTotalProductPrice(karat, weight, makingCharges) {
    const pricePerGramUsd = await fetchGoldPrice();
    const egpRate = await getExchangeRateToEGP();

    const karatPercentage = Number(karat) / 24;
    const pricePerGramEgp = pricePerGramUsd * karatPercentage * egpRate;
    const totalPrice = (pricePerGramEgp * weight) + makingCharges;

    return {
        gold_price_per_gram_egp: pricePerGramEgp.toFixed(2),
        total_price_egp: totalPrice.toFixed(2),
    };
}


export const calculateProductPrice = catchAsync(async (req, res) => {
    const { karat, weight, makingCharges } = req.body;
    if (!weight || !karat || makingCharges === undefined) {
        return res.status(400).json({ error: 'weight, karat, makingCharges are required' });
    }

    try {
        const priceDetails = await calculateTotalProductPrice(karat, weight, makingCharges);
        res.json(priceDetails);
    } catch (error) {
        console.error('Error calculating product price:', error);
        res.status(500).json({ error: 'Failed to calculate product price' });
    }
});

// 3. Background service to update prices
export const refreshProductPrices = async () => {
    const products = await Product.find({});

    for (const product of products) {
        try {
            const newPriceDetails = await calculateTotalProductPrice(
                product.karat,
                product.weight,
                product.makingCharges = 0, // Assuming makingCharges is a field in the product model
            );

            await Product.findByIdAndUpdate(product._id, {
                price: newPriceDetails.total_price_egp,
                goldPrice: newPriceDetails.gold_price_per_gram_egp,
                lastPriceUpdate: new Date()
            });
            
            console.log(`Updated price for product ${product._id}: ${product.price} ${newPriceDetails.total_price_egp}`);
        } catch (error) {
            console.error(`Failed to update price for product ${product._id}:`, error);
        }
    };
}
// 4. Manual trigger for price updates
export const updatePrices = catchAsync(async (req, res, next) => {
    await refreshProductPrices();
    //res.json({ message: 'All prices updated successfully' });
    console.log('All prices updated successfully');
    next();
});