<template>
  <App>
    <Header>
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Choose Guests</h1>
        <NuxtLink to="/">Back</NuxtLink>
      </div>
    </Header>

    <Main>
      <Container class="py-8">
        <PageHeader title="Choose who to split with" description="Select the people who will participate in this check." />

        <Card class="mt-6">
          <template #header>
            <h3 class="text-base font-medium">Guests</h3>
          </template>

          <div class="mt-4 space-y-4">
            <!-- Example guest items. Replace with real data or a store. -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Avatar name="Alex" />
                <div>
                  <div class="font-medium">Alex</div>
                  <div class="text-sm text-slate-500">You</div>
                </div>
              </div>
              <Checkbox />
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Avatar name="Jordan" />
                <div>
                  <div class="font-medium">Jordan</div>
                  <div class="text-sm text-slate-500">Friend</div>
                </div>
              </div>
              <Checkbox />
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Avatar name="Sam" />
                <div>
                  <div class="font-medium">Sam</div>
                  <div class="text-sm text-slate-500">Friend</div>
                </div>
              </div>
              <Checkbox />
            </div>

          </div>

          <div class="mt-6 flex justify-end gap-2">
            <NuxtLink to="/">
              <Button variant="ghost">Cancel</Button>
            </NuxtLink>
            <NuxtLink to="/split/receipt">
              <Button>Next: Receipt</Button>
            </NuxtLink>
          </div>
        </Card>
      </Container>
    </Main>
  </App>
</template>

<script setup>
// Scaffold for choosing guests. Wire this page to a store (Pinia) or local state
// to persist selected guests between steps.
</script>
