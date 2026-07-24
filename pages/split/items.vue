<template>
  <App>
    <Header>
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Assign Items</h1>
        <NuxtLink to="/split/receipt">Back</NuxtLink>
      </div>
    </Header>

    <Main>
      <Container class="py-8">
        <PageHeader title="Split items" description="Add items from the receipt and assign them to guests." />

        <Card class="mt-6">
          <template #header>
            <h3 class="text-base font-medium">Items</h3>
          </template>

          <div class="mt-4 space-y-4">
            <!-- Example item row. Replace with a dynamic list and form to add items. -->
            <div class="grid grid-cols-12 gap-3 items-center">
              <div class="col-span-6">
                <Input placeholder="Item name (e.g., Margherita)" />
              </div>
              <div class="col-span-2">
                <InputNumber placeholder="Price" />
              </div>
              <div class="col-span-4 flex gap-2 items-center">
                <span class="text-sm text-slate-600">Assign to:</span>
                <Chip>Alex</Chip>
                <Chip>Jordan</Chip>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <div class="text-sm text-slate-500">Add as many items as needed. You can assign each item to multiple guests.</div>
              <div>
                <Button variant="ghost">Add item</Button>
              </div>
            </div>

            <Separator />

            <div class="flex justify-end gap-2 mt-4">
              <NuxtLink to="/split/receipt"><Button variant="ghost">Back</Button></NuxtLink>
              <!-- navigating to a final check page (id 'final' used as placeholder) -->
              <NuxtLink :to="`/checks/final`"><Button>Finish & View Check</Button></NuxtLink>
            </div>
          </div>
        </Card>
      </Container>
    </Main>
  </App>
</template>

<script setup>
// Scaffold for assigning items to guests. Implement item list management and
// assignment logic (Pinia store recommended) and then navigate to checks/[id].
</script>
