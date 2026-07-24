<template>
  <App>
    <Header>
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Check</h1>
        <NuxtLink to="/">Home</NuxtLink>
      </div>
    </Header>

    <Main>
      <Container class="py-8">
        <PageHeader :title="`Check ${id}`" description="Finalized check summary and per-guest amounts." />

        <Card class="mt-6">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-medium">Summary</h3>
              <div class="text-sm text-slate-500">ID: {{ id }}</div>
            </div>
          </template>

          <div class="mt-4 space-y-4">
            <!-- Placeholder summary. Replace with real computed totals and assignments. -->
            <div>
              <h4 class="font-medium">Guests</h4>
              <ul class="mt-2 space-y-2">
                <li class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Avatar name="Alex" />
                    <div>
                      <div class="font-medium">Alex</div>
                      <div class="text-sm text-slate-500">2 items</div>
                    </div>
                  </div>
                  <div class="font-medium">$12.50</div>
                </li>

                <li class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Avatar name="Jordan" />
                    <div>
                      <div class="font-medium">Jordan</div>
                      <div class="text-sm text-slate-500">1 item</div>
                    </div>
                  </div>
                  <div class="font-medium">$8.00</div>
                </li>
              </ul>
            </div>

            <Separator />

            <div class="flex items-center justify-between">
              <div class="text-sm text-slate-500">Total</div>
              <div class="text-lg font-semibold">$20.50</div>
            </div>

            <div class="flex justify-end gap-2 mt-4">
              <NuxtLink to="/split/items"><Button variant="ghost">Edit</Button></NuxtLink>
              <Button>Share</Button>
            </div>
          </div>
        </Card>
      </Container>
    </Main>
  </App>
</template>

<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
const id = route.params.id || 'final'
</script>
