import test from 'node:test';import assert from 'node:assert/strict';import {itemTotal,cartTotal,deliveryTotal} from '../src/lib/pricing.ts';
test('soma tamanho, adicionais e quantidade em centavos',()=>{assert.equal(itemTotal({price_cents:1800,qty:2,extras:[{price_cents:200},{price_cents:0}]}),4000)});
test('calcula carrinho e entrega',()=>{const items=[{price_cents:1200,qty:1,extras:[]},{price_cents:1800,qty:1,extras:[{price_cents:200}]}];assert.equal(cartTotal(items),3200);assert.equal(deliveryTotal(items,'delivery',500),3700);assert.equal(deliveryTotal(items,'pickup',500),3200)});
