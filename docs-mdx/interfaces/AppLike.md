---
title: "Interface: AppLike"
description: "Documentation for Interface: AppLike"
---

[@base44/sdk](../README.md) / AppLike

# Interface: AppLike

## Table of contents

### Properties

- [id](AppLike.md#id)
- [conversation](AppLike.md#conversation)
- [app\_stage](AppLike.md#app_stage)
- [created\_date](AppLike.md#created_date)
- [updated\_date](AppLike.md#updated_date)
- [created\_by](AppLike.md#created_by)
- [organization\_id](AppLike.md#organization_id)
- [name](AppLike.md#name)
- [user\_description](AppLike.md#user_description)
- [entities](AppLike.md#entities)
- [additional\_user\_data\_schema](AppLike.md#additional_user_data_schema)
- [pages](AppLike.md#pages)
- [components](AppLike.md#components)
- [layout](AppLike.md#layout)
- [globals\_css](AppLike.md#globals_css)
- [agents](AppLike.md#agents)
- [logo\_url](AppLike.md#logo_url)
- [slug](AppLike.md#slug)
- [public\_settings](AppLike.md#public_settings)
- [is\_blocked](AppLike.md#is_blocked)
- [github\_repo\_url](AppLike.md#github_repo_url)
- [main\_page](AppLike.md#main_page)
- [installable\_integrations](AppLike.md#installable_integrations)
- [backend\_project](AppLike.md#backend_project)
- [last\_deployed\_at](AppLike.md#last_deployed_at)
- [is\_remixable](AppLike.md#is_remixable)
- [remixed\_from\_app\_id](AppLike.md#remixed_from_app_id)
- [hide\_entity\_created\_by](AppLike.md#hide_entity_created_by)
- [platform\_version](AppLike.md#platform_version)
- [enable\_username\_password](AppLike.md#enable_username_password)
- [auth\_config](AppLike.md#auth_config)
- [status](AppLike.md#status)
- [custom\_instructions](AppLike.md#custom_instructions)
- [frozen\_files](AppLike.md#frozen_files)
- [deep\_coding\_mode](AppLike.md#deep_coding_mode)
- [needs\_to\_add\_diff](AppLike.md#needs_to_add_diff)
- [installed\_integration\_context\_items](AppLike.md#installed_integration_context_items)
- [model](AppLike.md#model)
- [is\_starred](AppLike.md#is_starred)
- [agents\_enabled](AppLike.md#agents_enabled)
- [categories](AppLike.md#categories)
- [functions](AppLike.md#functions)
- [function\_names](AppLike.md#function_names)
- [user\_entity](AppLike.md#user_entity)
- [app\_code\_hash](AppLike.md#app_code_hash)
- [has\_backend\_functions\_enabled](AppLike.md#has_backend_functions_enabled)

## Properties

### id

• `Optional` **id**: `string`

#### Defined in

[modules/app.types.ts:33](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L33)

___

### conversation

• `Optional` **conversation**: ``null`` \| [`AppConversationLike`](AppConversationLike.md)

#### Defined in

[modules/app.types.ts:34](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L34)

___

### app\_stage

• `Optional` **app\_stage**: `string`

#### Defined in

[modules/app.types.ts:35](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L35)

___

### created\_date

• `Optional` **created\_date**: `string`

#### Defined in

[modules/app.types.ts:36](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L36)

___

### updated\_date

• `Optional` **updated\_date**: `string`

#### Defined in

[modules/app.types.ts:37](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L37)

___

### created\_by

• `Optional` **created\_by**: `string`

#### Defined in

[modules/app.types.ts:38](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L38)

___

### organization\_id

• `Optional` **organization\_id**: `string`

#### Defined in

[modules/app.types.ts:39](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L39)

___

### name

• `Optional` **name**: `string`

#### Defined in

[modules/app.types.ts:40](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L40)

___

### user\_description

• `Optional` **user\_description**: `string`

#### Defined in

[modules/app.types.ts:41](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L41)

___

### entities

• `Optional` **entities**: `Record`\<`string`, `any`\>

#### Defined in

[modules/app.types.ts:42](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L42)

___

### additional\_user\_data\_schema

• `Optional` **additional\_user\_data\_schema**: `any`

#### Defined in

[modules/app.types.ts:43](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L43)

___

### pages

• `Optional` **pages**: `Object`

#### Index signature

▪ [key: `string`]: `string`

#### Defined in

[modules/app.types.ts:44](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L44)

___

### components

• **components**: `Object`

#### Index signature

▪ [key: `string`]: `any`

#### Defined in

[modules/app.types.ts:45](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L45)

___

### layout

• `Optional` **layout**: `string`

#### Defined in

[modules/app.types.ts:46](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L46)

___

### globals\_css

• `Optional` **globals\_css**: `string`

#### Defined in

[modules/app.types.ts:47](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L47)

___

### agents

• `Optional` **agents**: `Record`\<`string`, `any`\>

#### Defined in

[modules/app.types.ts:48](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L48)

___

### logo\_url

• `Optional` **logo\_url**: `string`

#### Defined in

[modules/app.types.ts:49](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L49)

___

### slug

• `Optional` **slug**: `string`

#### Defined in

[modules/app.types.ts:50](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L50)

___

### public\_settings

• `Optional` **public\_settings**: `string`

#### Defined in

[modules/app.types.ts:51](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L51)

___

### is\_blocked

• `Optional` **is\_blocked**: `boolean`

#### Defined in

[modules/app.types.ts:52](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L52)

___

### github\_repo\_url

• `Optional` **github\_repo\_url**: `string`

#### Defined in

[modules/app.types.ts:53](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L53)

___

### main\_page

• `Optional` **main\_page**: `string`

#### Defined in

[modules/app.types.ts:54](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L54)

___

### installable\_integrations

• `Optional` **installable\_integrations**: `any`

#### Defined in

[modules/app.types.ts:55](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L55)

___

### backend\_project

• `Optional` **backend\_project**: [`DenoProjectLike`](DenoProjectLike.md)

#### Defined in

[modules/app.types.ts:56](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L56)

___

### last\_deployed\_at

• `Optional` **last\_deployed\_at**: `string`

#### Defined in

[modules/app.types.ts:57](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L57)

___

### is\_remixable

• `Optional` **is\_remixable**: `boolean`

#### Defined in

[modules/app.types.ts:58](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L58)

___

### remixed\_from\_app\_id

• `Optional` **remixed\_from\_app\_id**: `string`

#### Defined in

[modules/app.types.ts:59](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L59)

___

### hide\_entity\_created\_by

• `Optional` **hide\_entity\_created\_by**: `boolean`

#### Defined in

[modules/app.types.ts:60](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L60)

___

### platform\_version

• `Optional` **platform\_version**: `number`

#### Defined in

[modules/app.types.ts:61](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L61)

___

### enable\_username\_password

• `Optional` **enable\_username\_password**: `boolean`

#### Defined in

[modules/app.types.ts:62](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L62)

___

### auth\_config

• `Optional` **auth\_config**: [`AuthConfigLike`](AuthConfigLike.md)

#### Defined in

[modules/app.types.ts:63](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L63)

___

### status

• `Optional` **status**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `state?` | ... \| ... |
| `details?` | `any` |
| `last_updated_date?` | ... \| ... |

#### Defined in

[modules/app.types.ts:64](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L64)

___

### custom\_instructions

• `Optional` **custom\_instructions**: `any`

#### Defined in

[modules/app.types.ts:69](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L69)

___

### frozen\_files

• `Optional` **frozen\_files**: `string`[]

#### Defined in

[modules/app.types.ts:70](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L70)

___

### deep\_coding\_mode

• `Optional` **deep\_coding\_mode**: `boolean`

#### Defined in

[modules/app.types.ts:71](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L71)

___

### needs\_to\_add\_diff

• `Optional` **needs\_to\_add\_diff**: `boolean`

#### Defined in

[modules/app.types.ts:72](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L72)

___

### installed\_integration\_context\_items

• `Optional` **installed\_integration\_context\_items**: `any`[]

#### Defined in

[modules/app.types.ts:73](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L73)

___

### model

• `Optional` **model**: `string`

#### Defined in

[modules/app.types.ts:74](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L74)

___

### is\_starred

• `Optional` **is\_starred**: `boolean`

#### Defined in

[modules/app.types.ts:75](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L75)

___

### agents\_enabled

• `Optional` **agents\_enabled**: `boolean`

#### Defined in

[modules/app.types.ts:76](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L76)

___

### categories

• `Optional` **categories**: `string`[]

#### Defined in

[modules/app.types.ts:77](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L77)

___

### functions

• `Optional` **functions**: `any`

#### Defined in

[modules/app.types.ts:78](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L78)

___

### function\_names

• `Optional` **function\_names**: `string`[]

#### Defined in

[modules/app.types.ts:79](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L79)

___

### user\_entity

• `Optional` **user\_entity**: [`UserEntityLike`](UserEntityLike.md)

#### Defined in

[modules/app.types.ts:80](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L80)

___

### app\_code\_hash

• `Optional` **app\_code\_hash**: `string`

#### Defined in

[modules/app.types.ts:81](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L81)

___

### has\_backend\_functions\_enabled

• `Optional` **has\_backend\_functions\_enabled**: `boolean`

#### Defined in

[modules/app.types.ts:82](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/app.types.ts#L82)
