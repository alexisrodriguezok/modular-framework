<template>
    <v-card>
        <v-card-title v-t="'session.card.sessionsByClient'">Sessions By Client</v-card-title>
        <v-card-text>
            <pie-chart :chart-data="getData" ></pie-chart>
        </v-card-text>
    </v-card>
</template>

<script>
    import PieChart from "../../../components/charts/PieChart";
    import ChartsMixin from "../../../mixins/ChartsMixin";

    export default {
        name: "SessionsByHttpClientCard",
        components: {PieChart},
        mixins: [ChartsMixin],
        props: {
            data: Array,
            height: {
                type: Number, default: 200
            }
        },
        computed: {
            getData() {
                let obj = {labels: [], datasets: [{data: [], backgroundColor: this.backgroundColor}]}

                this.data.forEach(i => {
                    obj.labels.push(i.clientname)
                    obj.datasets[0].data.push(i.sum)
                })

                return obj
            }
        }
    }
</script>

<style scoped>

</style>
