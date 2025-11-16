[**@base44/sdk**](../README.md)

***

# Interface: AppLike

## Properties

### id?

> `optional` **id**: `string`

***

### conversation?

> `optional` **conversation**: [`AppConversationLike`](AppConversationLike.md) \| `null`

***

### app\_stage?

> `optional` **app\_stage**: `string`

***

### created\_date?

> `optional` **created\_date**: `string`

***

### updated\_date?

> `optional` **updated\_date**: `string`

***

### created\_by?

> `optional` **created\_by**: `string`

***

### organization\_id?

> `optional` **organization\_id**: `string`

***

### name?

> `optional` **name**: `string`

***

### user\_description?

> `optional` **user\_description**: `string`

***

### entities?

> `optional` **entities**: `Record`\<`string`, `any`\>

***

### additional\_user\_data\_schema?

> `optional` **additional\_user\_data\_schema**: `any`

***

### pages?

> `optional` **pages**: `object`

#### Index Signature

\[`key`: `string`\]: `string`

***

### components

> **components**: `object`

#### Index Signature

\[`key`: `string`\]: `any`

***

### layout?

> `optional` **layout**: `string`

***

### globals\_css?

> `optional` **globals\_css**: `string`

***

### agents?

> `optional` **agents**: `Record`\<`string`, `any`\>

***

### logo\_url?

> `optional` **logo\_url**: `string`

***

### slug?

> `optional` **slug**: `string`

***

### public\_settings?

> `optional` **public\_settings**: `string`

***

### is\_blocked?

> `optional` **is\_blocked**: `boolean`

***

### github\_repo\_url?

> `optional` **github\_repo\_url**: `string`

***

### main\_page?

> `optional` **main\_page**: `string`

***

### installable\_integrations?

> `optional` **installable\_integrations**: `any`

***

### backend\_project?

> `optional` **backend\_project**: [`DenoProjectLike`](DenoProjectLike.md)

***

### last\_deployed\_at?

> `optional` **last\_deployed\_at**: `string`

***

### is\_remixable?

> `optional` **is\_remixable**: `boolean`

***

### remixed\_from\_app\_id?

> `optional` **remixed\_from\_app\_id**: `string`

***

### hide\_entity\_created\_by?

> `optional` **hide\_entity\_created\_by**: `boolean`

***

### platform\_version?

> `optional` **platform\_version**: `number`

***

### enable\_username\_password?

> `optional` **enable\_username\_password**: `boolean`

***

### auth\_config?

> `optional` **auth\_config**: [`AuthConfigLike`](AuthConfigLike.md)

***

### status?

> `optional` **status**: `object`

#### state?

> `optional` **state**: ... \| ...

#### details?

> `optional` **details**: `any`

#### last\_updated\_date?

> `optional` **last\_updated\_date**: ... \| ...

***

### custom\_instructions?

> `optional` **custom\_instructions**: `any`

***

### frozen\_files?

> `optional` **frozen\_files**: `string`[]

***

### deep\_coding\_mode?

> `optional` **deep\_coding\_mode**: `boolean`

***

### needs\_to\_add\_diff?

> `optional` **needs\_to\_add\_diff**: `boolean`

***

### installed\_integration\_context\_items?

> `optional` **installed\_integration\_context\_items**: `any`[]

***

### model?

> `optional` **model**: `string`

***

### is\_starred?

> `optional` **is\_starred**: `boolean`

***

### agents\_enabled?

> `optional` **agents\_enabled**: `boolean`

***

### categories?

> `optional` **categories**: `string`[]

***

### functions?

> `optional` **functions**: `any`

***

### function\_names?

> `optional` **function\_names**: `string`[]

***

### user\_entity?

> `optional` **user\_entity**: [`UserEntityLike`](UserEntityLike.md)

***

### app\_code\_hash?

> `optional` **app\_code\_hash**: `string`

***

### has\_backend\_functions\_enabled?

> `optional` **has\_backend\_functions\_enabled**: `boolean`
