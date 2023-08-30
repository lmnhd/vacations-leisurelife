import { Grid, Icon, Label } from "semantic-ui-react";

const PropertyRating = ({rating}) => {
  
  const wholeNum = Math.floor(rating);
  const decimal = rating / wholeNum !== 1;
  //console.log(decimal);

  const __renderStars = () => {
    let result = [];
    for (let index = 0; index < wholeNum; index++) {
      result.push(<Icon name="star"></Icon>);
    }
    if (decimal) {
      result.push(<Icon name="star half"></Icon>);
    }

    return <div>{result}</div>;
  };

  return (
    <Grid divided>
      <Grid.Row>
        <Grid.Column textAlign="center">
         {__renderStars()}
          <Label>{rating} stars</Label>
        </Grid.Column>
      </Grid.Row>
      {/* <Grid.Row columns={2}>
        <Grid.Column textAlign="center" >
          <Label>{rating} stars</Label>
        </Grid.Column>
      
      </Grid.Row> */}
    </Grid>
  );
};

export default PropertyRating;
