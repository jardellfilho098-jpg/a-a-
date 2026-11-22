export type Priceable={price_cents:number;qty:number;extras:Array<{price_cents:number}>};
export function itemTotal(item:Priceable):number {return (item.price_cents+item.extras.reduce((sum,extra)=>sum+extra.price_cents,0))*item.qty;}
export function cartTotal(items:Priceable[]):number{return items.reduce((sum,item)=>sum+itemTotal(item),0)}
export function deliveryTotal(items:Priceable[],mode:'delivery'|'pickup',fee:number):number{return cartTotal(items)+(mode==='delivery'?fee:0)}
