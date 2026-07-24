<template>
  <App>
    <Header>
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold">FiftyFifty</h1>
        <nav class="space-x-2">
          <NuxtLink to="/">Home</NuxtLink>
          <NuxtLink to="/split/guests">Split a check</NuxtLink>
        </nav>
      </div>
    </Header>

    <Main>
      <Container class="py-10">
        <PageHeader title="Welcome to FiftyFifty" description="Quickly split bills with friends. Start a new split flow or review existing checks." />

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-medium">Start a new split</h2>
                <Badge>Recommended</Badge>
              </div>
            </template>

            <p class="text-sm text-slate-600 mt-2">Follow a simple 3-step flow to choose guests, enter your receipt, and assign items.</p>

            <div class="mt-4 flex gap-2">
              <NuxtLink to="/split/guests">
                <Button>Start split</Button>
              </NuxtLink>
              <NuxtLink to="/split/receipt">
                <Button variant="ghost">Enter receipt</Button>
              </NuxtLink>
            </div>
          </Card>

          <Card>
            <template #header>
              <h2 class="text-lg font-medium">Recent checks</h2>
            </template>

            <div class="mt-2">
              <Empty title="No checks yet" description="Create your first check to get started." />
            </div>

            <div class="mt-4">
              <NuxtLink to="/split/guests"><Button>Create first check</Button></NuxtLink>
            </div>
          </Card>
        </div>
      </Container>
    </Main>

    <Footer class="mt-10">
      <div class="container mx-auto px-4 py-6 text-sm text-slate-500">© 2026 FiftyFifty</div>
    </Footer>
  </App>
</template>

<script setup>
// Page scaffold for the app hub/homepage.
</script>
