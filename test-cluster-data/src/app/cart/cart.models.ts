
export interface CartItem {
  productId: string;
  productName?: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface Cart {
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartSummary {
  itemCount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface CartPromo {
  code: string;
  discount: number;
  type: 'percent' | 'fixed';
}
