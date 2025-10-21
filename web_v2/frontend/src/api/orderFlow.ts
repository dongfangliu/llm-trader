/**
 * 订单流分析API
 */

import axios from './client';

export interface VPINData {
  vpin: number;
  level: 'low' | 'medium' | 'high';
  trend: 'rising' | 'falling' | 'stable';
  timestamp: string;
  interpretation: string;
}

export interface OrderBookSnapshot {
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
  bid_depth: number;
  ask_depth: number;
  imbalance: number;
  depth_ratio: number;
  status: string;
  timestamp: string;
}

export interface LargeOrder {
  side: 'buy' | 'sell';
  volume: number;
  price: number;
  price_impact: number;
  toxicity_score: number;
  timestamp: string;
}

/**
 * 获取当前VPIN值
 */
export const getCurrentVPIN = async (): Promise<VPINData> => {
  const response = await axios.get('/order-flow/vpin/current');
  return response.data.data;
};

/**
 * 获取VPIN历史
 */
export const getVPINHistory = async (minutes: number = 60) => {
  const response = await axios.get('/order-flow/vpin/history', {
    params: { minutes }
  });
  return response.data.data;
};

/**
 * 获取订单簿快照
 */
export const getOrderBookSnapshot = async (): Promise<OrderBookSnapshot> => {
  const response = await axios.get('/order-flow/orderbook/snapshot');
  return response.data.data;
};

/**
 * 获取订单簿动态
 */
export const getOrderBookDynamics = async (minutes: number = 30) => {
  const response = await axios.get('/order-flow/orderbook/dynamics', {
    params: { minutes }
  });
  return response.data.data;
};

/**
 * 获取大单追踪
 */
export const getLargeOrdersData = async (minutes: number = 60) => {
  const response = await axios.get('/order-flow/large-orders', {
    params: { minutes }
  });
  return response.data.data;
};

// 别名供页面使用
export const getVPIN = getCurrentVPIN;
export const getOrderBook = getOrderBookSnapshot;
export const getLargeOrders = getLargeOrdersData;
